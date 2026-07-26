/**
 * 研究主控 Agent (ReAct)
 *
 * 替换原 llmEngine.ts 的单次 Tavily + LLM 流水线。
 *
 * 核心循环：
 *   Thought（推理下一步）→ Action（调用 Tavily）→ Observation（评估结果质量）
 *   → 满足终止条件则生成 6 张卡片，否则继续循环
 *
 * 终止条件：
 *   - observation.quality === 'sufficient'
 *   - 达到 maxSteps（默认 5）
 *   - 连续 2 次无新增有效事实
 *
 * 信源准确率保障：
 *   - 风控层传入的 includeDomains / excludeDomains 强制应用于每次 Tavily 调用
 *   - Observation 阶段提取可验证事实并标注来源
 *   - crossValidate：同一事实在 ≥2 信源出现 → confidence=high
 */
import type { EntityType, IntelCard, IntelSource } from '../../shared/types.js'
import { filterSources } from './riskGuard.js'
import { getActiveAdapters, searchAll } from './sources/registry.js'
import { rawDocToIntelSource } from './sources/tavilyAdapter.js'
import type { RecallResult, RawDoc, SourceName, Dimension } from './sources/types.js'
import { callLLM as _callLLM, extractJSON as _extractJSON } from './llmClient.js'
import { planQueries, type PlannedQuery } from './queryPlanner.js'
import { enrichSourcesWithConfidence } from './fusion/confidence.js'

// 向后兼容：re-export 供旧代码导入（llmClient 已抽取为独立模块）
export const callLLM = _callLLM
export const extractJSON = _extractJSON

// ===== 配置 =====

function cfg() {
  return {
    LLM_API_KEY: process.env.LLM_API_KEY ?? '',
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
    LLM_MODEL: process.env.LLM_MODEL ?? 'deepseek-chat',
  }
}

const MAX_STEPS = 3
const MAX_RESULTS_PER_SEARCH = 6

// ===== 类型 =====

export type AgentStage = 'thinking' | 'searching' | 'observing' | 'finalizing'

export interface AgentProgressEvent {
  type: 'agent_step'
  step: number
  maxSteps: number
  thought: string
  stage: AgentStage
  searchQuery?: string
  searchFocus?: string
  quality?: 'sufficient' | 'partial' | 'insufficient'
  gaps?: string[]
  newSources?: { title: string; url: string }[]
  newFacts?: { content: string; category: string }[]
  coveredDimensions?: string[]
  sourcesCount?: number
  factsCount?: number
  bySource?: Record<string, number> // 多源构成（PRD-01，供研究中 UI 显示）
}

interface ExtractedFact {
  content: string
  sourceUrl: string
  sourceTitle: string
  category: 'verdict' | 'timeline' | 'achievements' | 'trends' | 'darkside' | 'gameplay' | 'unknown'
}

interface ObservationResult {
  extractedFacts: ExtractedFact[]
  coveredDimensions: string[]
  gaps: string[]
  quality: 'sufficient' | 'partial' | 'insufficient'
  needsMoreSearch: boolean
  suggestedNextQuery?: string
}

interface AggregatedFact {
  content: string
  sources: string[]
  sourceCount: number
  confidence: 'high' | 'medium' | 'low'
  category: ExtractedFact['category']
}

interface AgentState {
  query: string
  entityType: EntityType
  includeDomains?: string[]
  excludeDomains?: string[]
  maxSteps: number
  currentStep: number
  knowledgeBase: AggregatedFact[]
  searchHistory: { query: string; resultsCount: number }[]
  noNewInfoStreak: number
}

// ===== LLM 调用封装（已抽取到 llmClient.ts，此处仅 re-export 保持向后兼容）=====
// callLLM / extractJSON 见文件顶部 import + re-export

// ===== 多维度并行召回合并（PRD-01 FR-02 首轮 fan-out）=====

/**
 * 合并多维度并行召回结果。
 * 每个维度独立 searchAll（已去重+RRF），此处合并所有维度的 docs/images/bySource。
 * docs 不重新融合（各维度查询不同，重复概率低），仅去 URL 精确重复。
 */
function mergeMultiDimRecall(results: RecallResult[]): RecallResult {
  const seenUrls = new Set<string>()
  const docs: RawDoc[] = []
  const bySource: Record<string, number> = {}
  const images: string[] = []
  const perSource: { source: SourceName; docs: RawDoc[] }[] = []
  let answer: string | undefined

  for (const r of results) {
    // 合并 docs（URL 精确去重）
    for (const d of r.docs) {
      if (!seenUrls.has(d.url)) {
        seenUrls.add(d.url)
        docs.push(d)
      }
    }
    // 累加 bySource
    for (const [src, cnt] of Object.entries(r.bySource)) {
      bySource[src] = (bySource[src] ?? 0) + cnt
    }
    // 合并 images（去重）
    for (const img of r.images) {
      if (!images.includes(img)) images.push(img)
    }
    // 合并 perSource
    for (const ps of r.perSource) {
      const existing = perSource.find((p) => p.source === ps.source)
      if (existing) {
        existing.docs.push(...ps.docs)
      } else {
        perSource.push({ source: ps.source, docs: [...ps.docs] })
      }
    }
    // 取首个非空 answer
    if (!answer && r.answer) answer = r.answer
  }

  return { docs, bySource, images, answer, perSource }
}

/**
 * 并发限流执行器：按 concurrency 批次并行执行 tasks，避免压垮免费档 API（Exa 429 / GitHub 403）。
 * 返回与 Promise.allSettled 相同结构的 PromiseSettledResult[]。
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// ===== ReAct: Thought + Action 决策 =====

interface ActionDecision {
  thought: string
  action: 'search' | 'finalize'
  searchQuery?: string
  searchFocus?: string
}

const REACT_SYSTEM_PROMPT = `你是一个深度研究 Agent。你的任务是通过多轮搜索收集关于目标实体的可靠信息，最终生成情报卡片。

## 当前状态
- 已搜索次数: {step}/{maxSteps}
- 已收集事实: {factsCount} 条
- 信息缺口: {gaps}

## 可用动作
1. search — 发起一次新的搜索（需提供 searchQuery）
2. finalize — 信息已足够，生成最终卡片

## 决策原则
- 第一轮必须 search，使用用户原始查询
- 后续轮次根据缺口决定搜索词，聚焦未覆盖的维度
- 当覆盖度 >= 4 个维度，或达到 maxSteps-1 时，考虑 finalize
- searchQuery 要具体、聚焦，避免重复之前搜过的词

## 输出 JSON
{
  "thought": "简短说明你的推理（为什么这么搜/为什么结束）",
  "action": "search" | "finalize",
  "searchQuery": "搜索词（action=search 时必填）",
  "searchFocus": "这次搜索想补充的维度"
}`

async function decideNextAction(state: AgentState): Promise<ActionDecision> {
  const factsByCategory = new Set(state.knowledgeBase.map((f) => f.category))
  const gapsList = state.knowledgeBase.length === 0
    ? ['所有维度都未覆盖']
    : ['verdict', 'timeline', 'achievements', 'darkside', 'gameplay']
        .filter((d) => !factsByCategory.has(d as ExtractedFact['category']))
        .map((d) => d)

  const prompt = REACT_SYSTEM_PROMPT
    .replace('{step}', String(state.currentStep))
    .replace('{maxSteps}', String(state.maxSteps))
    .replace('{factsCount}', String(state.knowledgeBase.length))
    .replace('{gaps}', gapsList.join(', ') || '无明显缺口')

  const content = await callLLM(prompt, `目标实体: ${state.query}（类型: ${state.entityType}）`, {
    temperature: 0.3,
    maxTokens: 300,
    jsonMode: true,
  })

  try {
    const parsed = extractJSON(content) as Record<string, unknown>
    const action = parsed.action === 'finalize' ? 'finalize' : 'search'
    return {
      thought: typeof parsed.thought === 'string' ? parsed.thought : '',
      action,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : state.query,
      searchFocus: typeof parsed.searchFocus === 'string' ? parsed.searchFocus : undefined,
    }
  } catch {
    // 解析失败：默认继续搜索或终止
    if (state.currentStep >= state.maxSteps - 1) {
      return { thought: '达到步数上限，生成卡片', action: 'finalize' }
    }
    return { thought: '继续搜索收集信息', action: 'search', searchQuery: state.query }
  }
}

// ===== Observation: 评估搜索结果质量 =====

const OBSERVATION_SYSTEM_PROMPT = `你是信息质量评估器。基于搜索结果，评估信息是否足够生成可靠的知识面板。

## 任务
1. 从搜索结果中提取可验证的事实（每条事实必须带来源 URL）
2. 判断信息覆盖度，是否覆盖以下维度：
   - verdict: 核心定性（是谁/是什么）
   - timeline: 关键时间节点
   - achievements: 量化成就
   - trends: 发展趋势
   - darkside: 争议/负面
   - gameplay: 利益相关方与博弈
3. 识别信息缺口：还缺什么
4. 判断是否需要补充搜索

## 输出 JSON
{
  "extractedFacts": [
    {
      "content": "事实内容",
      "sourceUrl": "来源URL",
      "sourceTitle": "来源标题",
      "category": "verdict|timeline|achievements|trends|darkside|gameplay|unknown"
    }
  ],
  "coveredDimensions": ["verdict", "timeline"],
  "gaps": ["缺少的维度说明"],
  "quality": "sufficient|partial|insufficient",
  "needsMoreSearch": true|false,
  "suggestedNextQuery": "建议的下一步搜索词"
}

## quality 判断标准
- sufficient: 覆盖 >= 4 个维度，且有 darkside 和 gameplay
- partial: 覆盖 2-3 个维度
- insufficient: 覆盖 < 2 个维度

## 重要
- 只提取有明确来源的事实，不脑补
- 同一事实不要重复提取
- category 必须从给定值中选择`

async function observeResults(
  query: string,
  searchContext: string,
  existingFacts: AggregatedFact[],
): Promise<ObservationResult> {
  const existingSummary = existingFacts.length > 0
    ? `\n## 已有事实（避免重复提取）\n${existingFacts.map((f) => `- [${f.category}] ${f.content}`).join('\n')}`
    : ''

  const userPrompt = `目标: ${query}\n${existingSummary}\n\n## 本次搜索结果\n${searchContext}`

  const content = await callLLM(OBSERVATION_SYSTEM_PROMPT, userPrompt, {
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
  })

  try {
    const parsed = extractJSON(content) as Record<string, unknown>
    const rawFacts = Array.isArray(parsed.extractedFacts) ? parsed.extractedFacts : []
    // 兼容 LLM 字段名差异：sourceUrl | url | source 均视作来源 URL
    const facts: ExtractedFact[] = rawFacts
      .filter((f: any) => f && typeof f.content === 'string')
      .map((f: any) => ({
        content: f.content,
        sourceUrl:
          typeof f.sourceUrl === 'string'
            ? f.sourceUrl
            : typeof f.url === 'string'
              ? f.url
              : typeof f.source === 'string'
                ? f.source
                : '',
        sourceTitle: typeof f.sourceTitle === 'string' ? f.sourceTitle : '',
        category: typeof f.category === 'string' ? f.category : 'unknown',
      }))
      .filter((f) => f.sourceUrl || f.content)

    return {
      extractedFacts: facts,
      coveredDimensions: Array.isArray(parsed.coveredDimensions) ? parsed.coveredDimensions : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      quality:
        typeof parsed.quality === 'string' &&
        ['sufficient', 'partial', 'insufficient'].includes(parsed.quality)
          ? (parsed.quality as 'sufficient' | 'partial' | 'insufficient')
          : 'insufficient',
      needsMoreSearch: Boolean(parsed.needsMoreSearch),
      suggestedNextQuery:
        typeof parsed.suggestedNextQuery === 'string' ? parsed.suggestedNextQuery : undefined,
    }
  } catch (err) {
    console.warn(
      `[agent] Observation 解析失败:`,
      (err as Error).message,
      '原始内容(前200字):',
      content.slice(0, 200),
    )
    return {
      extractedFacts: [],
      coveredDimensions: [],
      gaps: ['解析失败'],
      quality: 'insufficient',
      needsMoreSearch: true,
    }
  }
}

// ===== 交叉验证 =====

function crossValidate(facts: AggregatedFact[]): AggregatedFact[] {
  if (facts.length === 0) return facts

  // 简单策略：按 category 分组，同 category 内若有多条事实描述相似内容则合并
  // 这里用保守策略——同 category 下内容前 20 字相同的视为同一事实
  const groups = new Map<string, AggregatedFact[]>()

  for (const f of facts) {
    const key = `${f.category}:${f.content.slice(0, 20)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }

  const result: AggregatedFact[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0])
    } else {
      // 合并：收集所有来源
      const allSources = new Set<string>()
      for (const f of group) for (const s of f.sources) allSources.add(s)
      const sourceCount = allSources.size
      result.push({
        content: group[0].content,
        sources: Array.from(allSources),
        sourceCount,
        confidence: sourceCount >= 2 ? 'high' : 'medium',
        category: group[0].category,
      })
    }
  }

  return result
}

// ===== 最终卡片生成 =====

const FINALIZE_SYSTEM_PROMPT = `你是「全知视野」情报引擎。基于已验证的多源事实，对目标进行全景解构。

## 安全合规约束（强制）
- 禁止输出任何涉政敏感、色情、暴力、毒品、恐怖主义相关内容
- 涉及争议性话题时保持中立客观，不做煽动性表述
- 涉及个人隐私的信息不予展示

## 输出要求
1. 结果指向：不讲废话，直接剥离修饰词，提炼硬核数据
2. 反向视角（强制）：必须在 darkside 中揭示争议、硬伤
3. 零废话：禁止"基于您的要求""综上所述"等污染 UI 的词汇
4. 数据优先：achievements 必须包含可量化的硬核指标
5. 博弈视角：gameplay 必须揭示各方利益诉求与底层逻辑
6. 趋势数据（可选）：无明确量化趋势数据时返回空数组

## 输出 JSON
{
  "verdict": { "title": "一句话硬核定性", "subtitle": "补充说明", "tags": ["标签1","标签2","标签3"] },
  "timeline": { "events": [{ "year": "年份", "title": "标题", "description": "描述" }] },
  "achievements": { "items": [{ "metric": "数据", "label": "名称", "context": "背景" }] },
  "darkside": { "controversies": [{ "title": "争议标题", "detail": "事实", "severity": "high|medium|low" }] },
  "gameplay": { "stakeholders": [{ "name": "名称", "position": "角色", "interest": "利益" }], "dynamics": "底层逻辑", "relations": [{ "from": "名称", "to": "名称", "relation": "竞争" }] },
  "trends": { "trends": [{ "label": "趋势名", "points": [{ "x": "2020", "y": 100 }] }] }
}`

async function generateFinalCards(
  query: string,
  entityType: EntityType,
  knowledgeBase: AggregatedFact[],
  searchContext: string,
): Promise<string> {
  // 构建事实摘要，按 category 分组
  const factsByCategory = new Map<string, string[]>()
  for (const f of knowledgeBase) {
    if (!factsByCategory.has(f.category)) factsByCategory.set(f.category, [])
    const sourceInfo = f.sourceCount >= 2 ? ` [${f.sourceCount}源印证]` : ''
    factsByCategory.get(f.category)!.push(`${f.content}${sourceInfo}`)
  }

  const factsSummary = Array.from(factsByCategory.entries())
    .map(([cat, facts]) => `### ${cat}\n${facts.map((f) => `- ${f}`).join('\n')}`)
    .join('\n\n')

  const userPrompt = `目标: ${query}（类型: ${entityType}）

## 已验证事实库
${factsSummary || '（无已验证事实，基于搜索资料生成）'}

## 原始搜索资料
${searchContext || '（无搜索资料）'}`

  return callLLM(FINALIZE_SYSTEM_PROMPT, userPrompt, {
    temperature: 0.7,
    jsonMode: true,
  })
}

// ===== 主循环 =====

/**
 * 运行研究 Agent
 *
 * @param onProgress 进度回调（用于 SSE 推送）
 * @returns { cards, sources, images, rawLLMOutput }
 *   - cards: 解析后的 IntelCard 数组（由 llmEngine 解析）
 *   - sources: 累积的所有数据源
 *   - images: 累积的所有图片
 *   - rawLLMOutput: 最终 LLM 生成的 JSON 字符串（由调用方解析）
 */
export async function runResearchAgent(
  query: string,
  entityType: EntityType,
  options: { includeDomains?: string[]; excludeDomains?: string[] },
  onProgress?: (event: AgentProgressEvent) => void,
): Promise<{
  rawLLMOutput: string
  sources: IntelSource[]
  images: string[]
  steps: number
  bySource: Record<string, number>
  coveredDimensions: string[]
  timeSpan?: { earliest?: string; latest?: string }
}> {
  const state: AgentState = {
    query,
    entityType,
    includeDomains: options.includeDomains,
    excludeDomains: options.excludeDomains,
    maxSteps: MAX_STEPS,
    currentStep: 0,
    knowledgeBase: [],
    searchHistory: [],
    noNewInfoStreak: 0,
  }

  const allSources: IntelSource[] = []
  const allImages: string[] = []
  let lastSearchContext = ''
  // 多源构成 / 维度覆盖 累积（PRD-01，供 source_stats）
  const bySourceTotal: Record<string, number> = {}
  const coveredDims = new Set<string>()

  // 安全推送：失败不影响主流程
  const emit = (evt: AgentProgressEvent): void => {
    try {
      onProgress?.(evt)
    } catch (e) {
      console.warn('[agent] progress emit failed:', (e as Error).message)
    }
  }

  // 上一轮 observation 建议的下一步搜索词，供下轮 thinking 推送引用
  let lastSuggestedNextQuery: string | undefined

  while (state.currentStep < state.maxSteps) {
    state.currentStep++

    // ① thinking — 正在推理下一步（decideNextAction 调用前）
    const isFirstStep = state.currentStep === 1
    const thinkingThought = isFirstStep
      ? `分析目标实体「${query}」，六维并行规划首轮 fan-out`
      : (lastSuggestedNextQuery
          ? `基于上轮评估，建议补充搜索：${lastSuggestedNextQuery}`
          : '分析已收集信息，规划下一步搜索')
    emit({
      type: 'agent_step',
      stage: 'thinking',
      step: state.currentStep,
      maxSteps: state.maxSteps,
      thought: thinkingThought,
      factsCount: state.knowledgeBase.length,
      sourcesCount: allSources.length,
    })

    // === Thought + Action ===
    // 首轮：六维并行规划（planQueries），不走 decideNextAction
    // 后续轮：decideNextAction 决定补搜缺口维度
    let plans: PlannedQuery[] | null = null
    let decision: ActionDecision
    if (isFirstStep) {
      try {
        plans = await planQueries(query, state.entityType)
        const dims = [...new Set(plans.map((p) => p.dimension))]
        decision = {
          thought: `首轮六维并行规划：${plans.length} 个子查询（${dims.join('/')}）`,
          action: 'search',
          searchQuery: query,
          searchFocus: '六维 fan-out',
        }
      } catch (err) {
        console.warn('[agent] 六维规划失败，降级为单一查询:', (err as Error).message)
        decision = await decideNextAction(state)
      }
    } else {
      decision = await decideNextAction(state)
    }

    // === 终止判断 ===
    if (decision.action === 'finalize') {
      console.log(`[agent] Step ${state.currentStep}: finalize — ${decision.thought}`)
      // finalizing 推送：强制 quality=sufficient，修复进度条不跳 95% 的 bug
      emit({
        type: 'agent_step',
        stage: 'finalizing',
        step: state.currentStep,
        maxSteps: state.maxSteps,
        thought: decision.thought,
        quality: 'sufficient',
        factsCount: state.knowledgeBase.length,
        sourcesCount: allSources.length,
      })
      break
    }

    // ② searching — 已确定搜索词，正在多源并行召回
    const searchQuery = decision.searchQuery || query
    console.log(`[agent] Step ${state.currentStep}: search "${searchQuery}" — ${decision.thought}`)
    emit({
      type: 'agent_step',
      stage: 'searching',
      step: state.currentStep,
      maxSteps: state.maxSteps,
      thought: decision.thought,
      searchQuery,
      searchFocus: decision.searchFocus,
      factsCount: state.knowledgeBase.length,
      sourcesCount: allSources.length,
    })

    // === Action：多源并行召回 + RRF 融合 + 去重（PRD-01）===
    const adapters = getActiveAdapters(state.entityType)
    let recall: RecallResult
    try {
      if (plans && plans.length > 0) {
        // 首轮六维并行：每个维度独立 searchAll，合并结果
        const searchOpts = {
          entityType: state.entityType,
          includeDomains: state.includeDomains,
          excludeDomains: state.excludeDomains,
          maxResults: MAX_RESULTS_PER_SEARCH,
        }
        // 并发限流：12 维同时请求会压垮 Exa（429）/GitHub（403）免费档
        // 策略：每批 CONCURRENCY 个并行，批间无延迟（allSettled 自然等待）
        const DIM_CONCURRENCY = 4
        const dimResults = await runWithConcurrency(
          plans,
          DIM_CONCURRENCY,
          (p) => searchAll(p.query, searchOpts, adapters),
        )
        const fulfilled: RecallResult[] = []
        const coveredDimsThisRound = new Set<Dimension>()
        dimResults.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            fulfilled.push(r.value)
            // 仅当该维度实际返回文档时才标记为已覆盖
            if (r.value.docs.length > 0) {
              coveredDimsThisRound.add(plans[i].dimension)
            }
          } else {
            console.warn(
              `[agent] 维度 ${plans[i].dimension} 召回失败:`,
              (r.reason as Error)?.message,
            )
          }
        })
        recall = fulfilled.length > 0 ? mergeMultiDimRecall(fulfilled) : {
          docs: [], bySource: {}, images: [], perSource: [],
        }
        // 累积实际命中的维度（非计划维度），避免空结果虚报覆盖
        for (const d of coveredDimsThisRound) coveredDims.add(d)
        console.log(`[agent] 六维并行召回完成: ${fulfilled.length}/${plans.length} 维成功, ${recall.docs.length} 文档, 覆盖 ${coveredDimsThisRound.size} 维`)
      } else {
        // 后续轮单一查询
        recall = await searchAll(searchQuery, {
          entityType: state.entityType,
          includeDomains: state.includeDomains,
          excludeDomains: state.excludeDomains,
          maxResults: MAX_RESULTS_PER_SEARCH,
        }, adapters)
      }
    } catch (err) {
      console.warn(`[agent] 多源召回失败:`, (err as Error).message)
      recall = { docs: [], bySource: {}, images: [], perSource: [] }
    }

    // 累积多源构成
    for (const [src, cnt] of Object.entries(recall.bySource)) {
      bySourceTotal[src] = (bySourceTotal[src] ?? 0) + cnt
    }

    state.searchHistory.push({ query: searchQuery, resultsCount: recall.docs.length })
    // 重建 context（沿用原 [title]\ncontent 格式，前置 Tavily AI 摘要）
    // PRD-01 修复：六维并行召回后文档数可达 100+，全量塞给 LLM 观察 → prompt 过大导致响应截断
    // 策略：取 RRF 排序前 MAX_DOCS_FOR_OBSERVATION 条，每条截断 MAX_DOC_CONTENT_LEN 字符
    const MAX_DOCS_FOR_OBSERVATION = 20
    const MAX_DOC_CONTENT_LEN = 800
    const docsForContext = recall.docs.slice(0, MAX_DOCS_FOR_OBSERVATION)
    const docsContext = docsForContext
      .map((d) => {
        const content = d.content.length > MAX_DOC_CONTENT_LEN
          ? d.content.slice(0, MAX_DOC_CONTENT_LEN) + '…'
          : d.content
        return `[${d.title}]\n${content}`
      })
      .join('\n\n---\n\n')
    lastSearchContext = recall.answer
      ? `AI摘要: ${recall.answer}\n\n详细资料（前${docsForContext.length}条，共${recall.docs.length}条）:\n${docsContext}`
      : docsContext

    // RawDoc → IntelSource（带 source/publishedAt），后置风控清洗
    // PRD-01 M2：附加 confidence / sourceCount（基于 crossSources + 域名权威 + 新鲜度）
    const docsByUrl = new Map(recall.docs.map((d) => [d.url, d]))
    const sourcesThisRound = enrichSourcesWithConfidence(
      filterSources(recall.docs.map(rawDocToIntelSource)),
      docsByUrl,
    )
    const newSourcesThisRound = sourcesThisRound.filter(
      (s) => !allSources.some((x) => x.url === s.url),
    )

    // 累积来源和图片
    for (const s of sourcesThisRound) {
      if (!allSources.some((x) => x.url === s.url)) allSources.push(s)
    }
    for (const img of recall.images) {
      if (!allImages.includes(img)) allImages.push(img)
    }

    // ③ observing-sources — 多源返回，正在提取事实/评估质量
    emit({
      type: 'agent_step',
      stage: 'observing',
      step: state.currentStep,
      maxSteps: state.maxSteps,
      thought: decision.thought,
      searchQuery,
      searchFocus: decision.searchFocus,
      newSources: newSourcesThisRound.slice(0, 3).map((s) => ({
        title: s.title.slice(0, 60),
        url: s.url,
      })),
      bySource: bySourceTotal,
      sourcesCount: allSources.length,
      factsCount: state.knowledgeBase.length,
    })

    // === Observation ===
    const observation = await observeResults(query, lastSearchContext, state.knowledgeBase)

    // 累积事实
    const beforeCount = state.knowledgeBase.length
    for (const f of observation.extractedFacts) {
      state.knowledgeBase.push({
        content: f.content,
        sources: [f.sourceUrl],
        sourceCount: 1,
        confidence: 'low',
        category: f.category,
      })
    }

    // 交叉验证
    state.knowledgeBase = crossValidate(state.knowledgeBase)

    const newFactsCount = state.knowledgeBase.length - beforeCount
    if (newFactsCount === 0) {
      state.noNewInfoStreak++
    } else {
      state.noNewInfoStreak = 0
    }

    // 记录 suggestedNextQuery 供下轮 thinking 推送引用
    lastSuggestedNextQuery = observation.suggestedNextQuery

    // 累积维度覆盖（全局，供 source_stats）
    for (const d of observation.coveredDimensions) coveredDims.add(d)

    console.log(
      `[agent] Observation: quality=${observation.quality}, facts=${state.knowledgeBase.length} (+${newFactsCount}), gaps=${observation.gaps.join('; ')}, sources=${allSources.length} bySource=${JSON.stringify(bySourceTotal)}`,
    )

    // ④ observing-facts — 评估完成，推送完整结果（替换原单一推送点）
    emit({
      type: 'agent_step',
      stage: 'observing',
      step: state.currentStep,
      maxSteps: state.maxSteps,
      thought: decision.thought,
      searchQuery,
      searchFocus: decision.searchFocus,
      quality: observation.quality,
      gaps: observation.gaps,
      newSources: newSourcesThisRound.slice(0, 3).map((s) => ({
        title: s.title.slice(0, 60),
        url: s.url,
      })),
      newFacts: observation.extractedFacts.slice(0, 3).map((f) => ({
        content: f.content.slice(0, 80),
        category: f.category,
      })),
      coveredDimensions: Array.from(coveredDims),
      bySource: bySourceTotal,
      sourcesCount: allSources.length,
      factsCount: state.knowledgeBase.length,
    })

    // === 提前终止判断 ===
    if (observation.quality === 'sufficient') {
      console.log(`[agent] 信息充足，提前终止`)
      break
    }

    // 连续 2 次无新增 → 终止避免空转
    if (state.noNewInfoStreak >= 2) {
      console.log(`[agent] 连续无新增事实，终止循环`)
      break
    }
  }

  // === 生成最终卡片 ===
  console.log(`[agent] 生成最终卡片，基于 ${state.knowledgeBase.length} 条已验证事实`)
  // finalizing 推送 — 整合情报档案（覆盖循环正常结束、未显式 finalize 的情况）
  emit({
    type: 'agent_step',
    stage: 'finalizing',
    step: state.currentStep,
    maxSteps: state.maxSteps,
    thought: '信息已充足，整合情报档案',
    quality: 'sufficient',
    factsCount: state.knowledgeBase.length,
    sourcesCount: allSources.length,
  })
  const rawLLMOutput = await generateFinalCards(query, entityType, state.knowledgeBase, lastSearchContext)

  // 计算时间跨度（从 sources 的 publishedAt 提取最早/最晚）
  const dates = allSources
    .map((s) => s.publishedAt)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .sort()
  const timeSpan =
    dates.length > 0 ? { earliest: dates[0], latest: dates[dates.length - 1] } : undefined

  return {
    rawLLMOutput,
    sources: allSources,
    images: allImages,
    steps: state.currentStep,
    bySource: bySourceTotal,
    coveredDimensions: Array.from(coveredDims),
    timeSpan,
  }
}

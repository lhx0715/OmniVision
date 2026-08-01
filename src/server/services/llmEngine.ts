/**
 * LLM 情报引擎
 * Tavily 实时搜索 + LLM 结构化生成 + Zod 强约束
 *
 * 无 API key 时自动回退到 mockEngine，Demo 可零配置运行
 */
import { z } from 'zod'
import type {
  EntityType,
  IntelCard,
  IntelSource,
  SourceStats,
  VerdictCardData,
  TimelineCardData,
  AchievementsCardData,
  DarksideCardData,
  GameplayCardData,
  TrendCardData,
} from '@shared/types.js'
import { filterSources } from './riskGuard.js'
import { runResearchAgent, type AgentProgressEvent } from './researchAgent.js'

// ===== 环境变量（延迟读取：ESM 导入在 dotenv.config() 之前执行）=====
function cfg() {
  return {
    TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? '',
    SERPER_API_KEY: process.env.SERPER_API_KEY ?? '',
    LLM_API_KEY: process.env.LLM_API_KEY ?? '',
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    LLM_MODEL: process.env.LLM_MODEL ?? 'gpt-4o',
    LLM_ROUTER_MODEL: process.env.LLM_ROUTER_MODEL ?? '',
  }
}

/** 是否已配置 LLM */
export function hasLLM(): boolean {
  return Boolean(process.env.LLM_API_KEY)
}

// ===== Zod Schema 约束（宽松：允许字段缺失/额外字段/数量偏差）=====

const VerdictSchema = z
  .object({
    title: z.string().describe('一句话硬核定性，禁止任何客套话与前言'),
    subtitle: z.string().describe('一句话补充说明，直击本质'),
    tags: z.array(z.string()).min(1).max(10).describe('1-10个核心标签'),
  })
  .passthrough()

const TimelineSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            year: z.string().describe('年份或时期'),
            title: z.string().describe('事件标题'),
            description: z.string().describe('一句话描述'),
          })
          .passthrough(),
      )
      .min(8)
      .max(20)
      .describe('8-20个核心转折点：尽可能覆盖所有重要时间节点，数量必须充足以支持多页时间线展示，不得少于8条'),
  })
  .passthrough()

const AchievementsSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            metric: z.string().describe('硬核数据指标，如金额、数量、排名'),
            label: z.string().describe('指标名称'),
            context: z.string().optional().describe('一句话背景说明'),
          })
          .passthrough(),
      )
      .min(1)
      .max(8)
      .describe('1-8个硬核战绩'),
  })
  .passthrough()

const DarksideSchema = z
  .object({
    controversies: z
      .array(
        z
          .object({
            title: z.string().describe('争议/硬伤标题'),
            detail: z.string().describe('一句话事实描述'),
            severity: z.string().default('medium').describe('严重程度'),
          })
          .passthrough(),
      )
      .min(4)
      .max(12)
      .describe('4-12个反向视角争议/负面点：必须全面覆盖（争议、失败、投诉、法律、道德、财务、产品硬伤等），数量必须充足，不得少于4条'),
  })
  .passthrough()

const GameplaySchema = z
  .object({
    stakeholders: z
      .array(
        z
          .object({
            name: z.string().describe('博弈方名称'),
            position: z.string().describe('角色定位，如裁判/对手/燃料'),
            interest: z.string().describe('核心利益诉求'),
          })
          .passthrough(),
      )
      .min(1)
      .max(6)
      .describe('1-6个关键博弈方'),
    dynamics: z.string().describe('底层逻辑一句话总结'),
    relations: z
      .array(
        z
          .object({
            from: z.string().describe('博弈方名称'),
            to: z.string().describe('另一个博弈方名称'),
            relation: z.string().describe('关系类型：竞争/合作/监管/依赖/对立等'),
          })
          .passthrough(),
      )
      .min(0)
      .max(15)
      .optional()
      .describe('博弈方之间的关系'),
  })
  .passthrough()

const TrendSchema = z
  .object({
    trends: z
      .array(
        z
          .object({
            label: z.string().describe('趋势名称'),
            points: z
              .array(
                z
                  .object({
                    x: z.string().describe('时间标签'),
                    y: z.number().describe('数值'),
                  })
                  .passthrough(),
              )
              .min(2)
              .max(20),
          })
          .passthrough(),
      )
      .min(0)
      .max(5)
      .describe('0-5个可量化趋势，无数据时返回空数组'),
  })
  .passthrough()

// 全量情报 Schema
const IntelReportSchema = z
  .object({
    verdict: VerdictSchema,
    timeline: TimelineSchema,
    achievements: AchievementsSchema,
    darkside: DarksideSchema,
    gameplay: GameplaySchema,
    trends: TrendSchema,
  })
  .passthrough()

// ===== 实时搜索 =====

interface TavilyResult {
  title: string
  url: string
  content: string
}

/** 搜索来源（与 IntelSource 结构一致） */
type TavilySource = { title: string; url: string }

/** 搜索返回结构：拼接上下文 + 来源列表 + 图片 URL 列表 */
interface SearchResult {
  context: string
  sources: IntelSource[]
  images: string[]
}

/**
 * Tavily 搜索 — 自带 AI 摘要，适合 RAG 场景
 * 通过 include_images 获取相关图片 URL
 */
async function searchWithTavily(query: string): Promise<SearchResult> {
  const { TAVILY_API_KEY } = cfg()
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      max_results: 8,
      include_answer: true,
      include_images: true,
      include_image_descriptions: false,
      search_depth: 'advanced',
    }),
  })
  if (!res.ok) {
    throw new Error(`Tavily 搜索失败: HTTP ${res.status}`)
  }
  const data = await res.json()
  const answer = data.answer ?? ''
  const results: TavilyResult[] = data.results ?? []
  const context = results
    .map((r) => `[${r.title}]\n${r.content}`)
    .join('\n\n---\n\n')
  const sources: TavilySource[] = results.map((r) => ({ title: r.title, url: r.url }))
  // Tavily 返回 data.images: string[]（图片 URL 数组），提取前 12 张
  const rawImages: unknown = data.images
  const images: string[] = Array.isArray(rawImages)
    ? rawImages.filter((u): u is string => typeof u === 'string').slice(0, 12)
    : []
  return {
    context: answer ? `AI摘要: ${answer}\n\n详细资料:\n${context}` : context,
    sources,
    images,
  }
}

/**
 * Serper 搜索 — Google 搜索结果，速度快
 */
async function searchWithSerper(query: string): Promise<SearchResult> {
  const { SERPER_API_KEY } = cfg()
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': SERPER_API_KEY,
    },
    body: JSON.stringify({ q: query, num: 10 }),
  })
  if (!res.ok) {
    throw new Error(`Serper 搜索失败: HTTP ${res.status}`)
  }
  const data = await res.json()
  const organic = data.organic ?? []
  const knowledgeGraph = data.knowledgeGraph ?? {}
  const parts: string[] = []
  const sources: TavilySource[] = []
  if (knowledgeGraph.title) {
    parts.push(`[知识图谱] ${knowledgeGraph.title}\n${knowledgeGraph.description ?? ''}`)
    if (knowledgeGraph.title && (knowledgeGraph.website || knowledgeGraph.url)) {
      sources.push({ title: knowledgeGraph.title, url: knowledgeGraph.website || knowledgeGraph.url })
    }
  }
  for (const r of organic) {
    parts.push(`[${r.title}]\n${r.snippet ?? ''}`)
    if (r.title && r.link) sources.push({ title: r.title, url: r.link })
  }
  // Serper 不支持图片搜索
  return { context: parts.join('\n\n---\n\n'), sources, images: [] }
}

/**
 * 统一搜索入口 — 优先 Tavily，其次 Serper
 * 第二重防护：返回前用 filterSources 清洗违规数据源
 */
async function searchWeb(query: string): Promise<SearchResult> {
  const { TAVILY_API_KEY, SERPER_API_KEY } = cfg()
  if (TAVILY_API_KEY) {
    const result = await searchWithTavily(query)
    // 后置防护：剔除违规 URL / 违规标题的数据源
    const filteredSources = filterSources(result.sources)
    console.log(`[llmEngine] 搜索完成: ${result.context.length} 字符, ${filteredSources.length}/${result.sources.length} 个来源（风控过滤）, ${result.images.length} 张图片`)
    return { ...result, sources: filteredSources }
  }
  if (SERPER_API_KEY) {
    const result = await searchWithSerper(query)
    const filteredSources = filterSources(result.sources)
    console.log(`[llmEngine] 搜索完成: ${result.context.length} 字符, ${filteredSources.length}/${result.sources.length} 个来源（风控过滤）`)
    return { ...result, sources: filteredSources }
  }
  return { context: '', sources: [], images: [] }
}

// ===== LLM 结构化生成 =====

const ENTITY_LABELS: Record<EntityType, string> = {
  HUMAN: '人物',
  EVENT: '事件/现象',
  ITEM: '产品/技术/物件',
}

// ===== 宽松解析辅助函数（Zod 校验失败时的兜底，仅做基本字段存在性检查）=====

function normalizeVerdict(v: any): VerdictCardData {
  return {
    title: typeof v?.title === 'string' ? v.title : '',
    subtitle: typeof v?.subtitle === 'string' ? v.subtitle : '',
    tags: Array.isArray(v?.tags)
      ? v.tags.filter((t: unknown): t is string => typeof t === 'string')
      : [],
  }
}

function normalizeTimeline(v: any): TimelineCardData {
  const events = Array.isArray(v?.events) ? v.events : []
  return {
    events: events
      .map((e: any) => ({
        year: typeof e?.year === 'string' ? e.year : '',
        title: typeof e?.title === 'string' ? e.title : '',
        description: typeof e?.description === 'string' ? e.description : '',
      }))
      .filter((e: { title: string; description: string }) => e.title || e.description),
  }
}

function normalizeAchievements(v: any): AchievementsCardData {
  const items = Array.isArray(v?.items) ? v.items : []
  return {
    items: items
      .map((i: any) => ({
        metric: typeof i?.metric === 'string' ? i.metric : '',
        label: typeof i?.label === 'string' ? i.label : '',
        context: typeof i?.context === 'string' ? i.context : undefined,
      }))
      .filter((i: { metric: string; label: string }) => i.metric || i.label),
  }
}

function normalizeDarkside(v: any): DarksideCardData {
  const controversies = Array.isArray(v?.controversies) ? v.controversies : []
  return {
    controversies: controversies
      .map((c: any) => {
        const sev = c?.severity
        const severity =
          sev === 'high' || sev === 'medium' || sev === 'low' ? sev : 'medium'
        return {
          title: typeof c?.title === 'string' ? c.title : '',
          detail: typeof c?.detail === 'string' ? c.detail : '',
          severity,
        }
      })
      .filter((c: { title: string; detail: string }) => c.title || c.detail),
  }
}

function normalizeGameplay(v: any): GameplayCardData {
  const stakeholders = Array.isArray(v?.stakeholders) ? v.stakeholders : []
  const relations = Array.isArray(v?.relations) ? v.relations : []
  const result: GameplayCardData = {
    stakeholders: stakeholders
      .map((s: any) => ({
        name: typeof s?.name === 'string' ? s.name : '',
        position: typeof s?.position === 'string' ? s.position : '',
        interest: typeof s?.interest === 'string' ? s.interest : '',
      }))
      .filter((s: { name: string; position: string }) => s.name || s.position),
    dynamics: typeof v?.dynamics === 'string' ? v.dynamics : '',
  }
  if (relations.length > 0) {
    const rels = relations
      .map((r: any) => ({
        from: typeof r?.from === 'string' ? r.from : '',
        to: typeof r?.to === 'string' ? r.to : '',
        relation: typeof r?.relation === 'string' ? r.relation : '',
      }))
      .filter((r: { from: string; to: string }) => r.from && r.to)
    if (rels.length > 0) result.relations = rels
  }
  return result
}

function normalizeTrends(v: any): TrendCardData {
  const trends = Array.isArray(v?.trends) ? v.trends : []
  return {
    trends: trends
      .map((t: any) => ({
        label: typeof t?.label === 'string' ? t.label : '',
        points: Array.isArray(t?.points)
          ? t.points
              .map((p: any) => ({
                x: typeof p?.x === 'string' ? p.x : p?.x != null ? String(p.x) : '',
                y: typeof p?.y === 'number' ? p.y : typeof p?.y === 'string' ? Number(p.y) || 0 : 0,
              }))
              .filter((p: { x: string }) => p.x !== '')
          : [],
      }))
      .filter((t: { label: string; points: unknown[] }) => t.label && t.points.length >= 2),
  }
}

/**
 * 构建 LLM 系统提示词
 */
function buildPrompt(query: string, entityType: EntityType, searchContext: string): string {
  return `你是「全知视野」情报引擎。对目标「${query}」（类型：${ENTITY_LABELS[entityType]}）进行全景解构。

## 搜索资料（实时抓取，可能含噪声，需自行甄别）
${searchContext || '（无搜索资料，基于你的知识库生成）'}

## 输出要求
1. **结果指向**：不讲废话，直接剥离修饰词，提炼硬核数据。
2. **反向视角**（强制）：必须在 darkside 中揭示争议、硬伤、槽点、利益博弈。看对立面比看正面荣誉更能抓到本质。**controversies 至少返回 4 条，最多 12 条，不得少于 4 条。应覆盖争议、失败、投诉、法律、道德、财务、产品硬伤等多维角度，不能只有3条。**
3. **零废话**：禁止输出"基于您的要求""综上所述""希望对您有帮助"等任何污染 UI 的词汇。
4. **数据优先**：achievements 必须包含可量化的硬核指标（金额、数量、排名、百分比）。
5. **博弈视角**：gameplay 必须揭示各方利益诉求与底层逻辑，不是简单罗列。
6. **趋势数据**（可选）：trends 中提取可量化的时间序列数据（如年度交付量、营收、用户增长）。如果目标无明确量化趋势数据，返回空数组 trends: []。
7. **博弈关系**：gameplay.relations 中列出 stakeholder 之间的关系（竞争/合作/监管/依赖/对立等）。
8. **时间线数量**（强制）：timeline.events **至少返回 8 条，最多 20 条**。尽可能覆盖起点、成长、关键转折、巅峰、挫折、现状等所有重要节点，不能只返回 3-4 条草草了事。信息源越丰富，时间线越要丰满。

## 输出格式
返回严格的 JSON，结构如下：
{
  "verdict": { "title": "一句话硬核定性", "subtitle": "补充说明", "tags": ["标签1","标签2","标签3"] },
  "timeline": { "events": [{ "year": "年份", "title": "标题", "description": "描述" }] },
  "achievements": { "items": [{ "metric": "数据", "label": "名称", "context": "背景" }] },
  "darkside": { "controversies": [{ "title": "争议标题", "detail": "事实", "severity": "high|medium|low" }] },
  "gameplay": { "stakeholders": [{ "name": "名称", "position": "角色", "interest": "利益" }], "dynamics": "底层逻辑", "relations": [{ "from": "名称", "to": "名称", "relation": "竞争" }] },
  "trends": { "trends": [{ "label": "趋势名", "points": [{ "x": "2020", "y": 100 }] }] }
}`
}

/**
 * 调用 LLM 并解析为结构化情报报告
 */
async function generateWithLLM(
  query: string,
  entityType: EntityType,
  searchContext: string,
): Promise<IntelCard[]> {
  const prompt = buildPrompt(query, entityType, searchContext)
  const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } = cfg()

  console.log(`[llmEngine] 调用 LLM: model=${LLM_MODEL}`)
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: `你是一个情报分析 AI。只输出 JSON，不输出任何其他内容。

## 安全合规约束（强制）
- 禁止输出任何涉政敏感、色情、暴力、毒品、恐怖主义相关内容
- 涉及争议性话题时保持中立客观，不做煽动性表述
- 涉及个人隐私的信息不予展示`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`LLM 请求失败: HTTP ${res.status} ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  console.log(`[llmEngine] LLM 返回: ${content.length} 字符`)
  if (!content) {
    throw new Error('LLM 返回空内容')
  }

  // 解析 JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    // 尝试提取 JSON 块
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('LLM 返回内容无法解析为 JSON')
    parsed = JSON.parse(match[0])
  }

  // safeParse + 宽松处理：校验失败时不抛异常，直接用 parsed 原始数据组装卡片
  const result = IntelReportSchema.safeParse(parsed)
  let verdict: VerdictCardData
  let timeline: TimelineCardData
  let achievements: AchievementsCardData
  let darkside: DarksideCardData
  let gameplay: GameplayCardData
  let trends: TrendCardData
  if (result.success) {
    verdict = result.data.verdict as VerdictCardData
    timeline = result.data.timeline as TimelineCardData
    achievements = result.data.achievements as AchievementsCardData
    darkside = result.data.darkside as DarksideCardData
    gameplay = result.data.gameplay as GameplayCardData
    trends = normalizeTrends(result.data.trends)
  } else {
    console.log(
      '[llmEngine] Zod 校验警告（已宽松处理）:',
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    )
    // 宽松处理：直接用 parsed 原始数据，做基本字段存在性检查
    const p = (parsed ?? {}) as Record<string, unknown>
    verdict = normalizeVerdict(p.verdict)
    timeline = normalizeTimeline(p.timeline)
    achievements = normalizeAchievements(p.achievements)
    darkside = normalizeDarkside(p.darkside)
    gameplay = normalizeGameplay(p.gameplay)
    trends = normalizeTrends(p.trends)
  }

  // 组装为 IntelCard 数组（顺序与前端 DISPLAY_ORDER 一致）
  const cards: IntelCard[] = [
    { cardType: 'verdict', payload: verdict },
    { cardType: 'timeline', payload: timeline },
    { cardType: 'achievements', payload: achievements },
  ]
  // 趋势卡片为可选项：仅当存在有效趋势数据时才加入
  if (trends.trends.length > 0) {
    cards.push({ cardType: 'trends', payload: trends })
  }
  cards.push(
    { cardType: 'darkside', payload: darkside },
    { cardType: 'gameplay', payload: gameplay },
  )

  console.log(`[llmEngine] 解析成功: ${cards.length} 张卡片`)
  return cards
}

// ===== LLM 流式生成 =====

/**
 * 流式调用 LLM
 * 逐 chunk 推送给 onChunk 回调，返回完整文本
 *
 * 复用 generateWithLLM 的调用模式，但启用 stream: true，
 * 解析 OpenAI 兼容的 SSE 流（data: [DONE] 结束）。
 */
export async function streamWithLLM(
  prompt: string,
  systemPrompt: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } = cfg()

  console.log(`[llmEngine] 流式调用 LLM: model=${LLM_MODEL}`)
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      stream: true,
    }),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`LLM 流式请求失败: HTTP ${res.status} ${errText.slice(0, 200)}`)
  }

  if (!res.body) {
    throw new Error('LLM 流式响应无 body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let fullText = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // 按行解析 SSE
      let lineEnd: number
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineEnd).trim()
        buffer = buffer.slice(lineEnd + 1)

        if (!line) continue
        // SSE 注释行（如 ': keepalive'）忽略
        if (line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue

        const data = line.slice(5).trim()
        if (data === '[DONE]') {
          return fullText
        }

        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) {
            fullText += delta
            onChunk(delta)
          }
        } catch {
          // 解析失败的 chunk 跳过（可能是不完整 JSON）
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return fullText
}

// ===== LLM 意图分类 =====

/**
 * 用 LLM 做零样本意图分类
 * 返回 HUMAN / EVENT / ITEM / null（模糊需澄清）
 */
export async function classifyIntentWithLLM(query: string): Promise<EntityType | null> {
  const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_ROUTER_MODEL } = cfg()
  const routerModel = LLM_ROUTER_MODEL || LLM_MODEL

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: routerModel,
      messages: [
        {
          role: 'system',
          content: `你是意图分类器。判断用户查询的目标类型。
只输出以下之一：
- HUMAN（人物：真实的人、历史人物、企业家、政治家等）
- EVENT（事件/现象：历史事件、社会现象、危机、运动等）
- ITEM（产品/技术/物件：具体产品、技术、公司、货币、作品、书籍、影视、游戏等）
- AMBIGUOUS（一词多义、无法确定，需要用户澄清）

判断规则：
- 文学作品、书籍、影视、游戏（如水浒传、红楼梦、三体）归为 ITEM
- 只有真正一词多义（如"苹果"可指公司/水果/乔布斯）才用 AMBIGUOUS
- 不确定时优先选最可能的类型，而非 AMBIGUOUS

只输出大写标签，不输出任何其他文字。`,
        },
        { role: 'user', content: query },
      ],
      temperature: 0,
      max_tokens: 10,
    }),
  })

  if (!res.ok) return null

  const data = await res.json()
  const raw = (data.choices?.[0]?.message?.content ?? '').trim().toUpperCase()

  if (raw.includes('HUMAN')) return 'HUMAN'
  if (raw.includes('EVENT')) return 'EVENT'
  if (raw.includes('ITEM')) return 'ITEM'
  return null
}

/**
 * 用 LLM 生成消歧选项
 * 当查询有歧义时，让 LLM 列出 2-4 个最可能的含义
 */
export async function clarifyOptionsWithLLM(query: string): Promise<{
  isAmbiguous: boolean
  options: { label: string; entityType: EntityType; description: string }[]
} | null> {
  const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_ROUTER_MODEL } = cfg()
  const routerModel = LLM_ROUTER_MODEL || LLM_MODEL

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: routerModel,
      messages: [
        {
          role: 'system',
          content: `你是歧义识别与消歧助手。
分析用户查询，判断是否存在歧义（一词多义、指代不明等）。

输出严格 JSON 格式：
{
  "isAmbiguous": true/false,
  "options": [
    {
      "label": "选项名称（简洁明确）",
      "entityType": "HUMAN/EVENT/ITEM",
      "description": "一句话描述这个含义",
      "searchQuery": "实际搜索时使用的精确关键词"
    }
  ]
}

规则：
- 有歧义时 isAmbiguous=true，options 给 2-4 个最可能的含义
- 没有歧义时 isAmbiguous=false，options 为空数组
- entityType 只能是 HUMAN（人物）、EVENT（事件/现象）、ITEM（产品/技术/物件）之一
- searchQuery 非常重要：必须是适合搜索引擎的精确关键词，优先使用英文+中文组合，确保能搜到正确类型的内容和图片
- 例如：苹果公司 → "Apple Inc. 苹果公司 iPhone"，乔布斯 → "Steve Jobs 史蒂夫·乔布斯"
- 不要输出任何额外文字，只输出 JSON`,
        },
        { role: 'user', content: query },
      ],
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) return null

  try {
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    const parsed = JSON.parse(content)
    if (parsed && Array.isArray(parsed.options)) {
      return {
        isAmbiguous: Boolean(parsed.isAmbiguous),
        options: parsed.options
          .filter((o: { label?: string; entityType?: string }) =>
            o.label && ['HUMAN', 'EVENT', 'ITEM'].includes(o.entityType ?? ''),
          )
          .map((o: { label: string; entityType: EntityType; description?: string; searchQuery?: string }) => ({
            label: o.label,
            entityType: o.entityType,
            description: o.description ?? '',
            searchQuery: o.searchQuery ?? o.label,
          })),
      }
    }
    return null
  } catch {
    return null
  }
}

// ===== 主入口（接口签名与 mockEngine 完全一致）=====

/**
 * 生成情报卡片
 * 1. 并发搜索全网最新资讯
 * 2. LLM 结构化生成 5 张卡片
 * @returns { cards: 5 张卡片, sources: 数据源列表, images: 图片 URL 列表 }
 */
export async function generateIntelCards(
  query: string,
  entityType: EntityType,
): Promise<{ cards: IntelCard[]; sources: IntelSource[]; images: string[] }> {
  console.log(`[llmEngine] 开始生成: query=${query}, type=${entityType}`)

  // ① 实时搜索（与 LLM 生成可并行，但搜索结果需喂给 LLM，所以先搜索）
  let searchContext = ''
  let sources: IntelSource[] = []
  let images: string[] = []
  try {
    const searchResult = await searchWeb(query)
    searchContext = searchResult.context
    sources = searchResult.sources
    images = searchResult.images
  } catch (err) {
    // 搜索失败不阻断，LLM 仍可基于自身知识生成
    console.warn('[llmEngine] 搜索失败，回退到 LLM 知识库:', (err as Error).message)
  }

  // ② LLM 结构化生成
  const cards = await generateWithLLM(query, entityType, searchContext)

  return { cards, sources, images }
}

// ===== Agent 模式：多轮 ReAct 研究 =====

/**
 * 解析 LLM 输出的 JSON 为 IntelCard 数组
 * 复用 normalize 系列函数，与 generateWithLLM 保持一致的宽松处理
 */
function parseLLMOutput(content: string): IntelCard[] {
  if (!content) throw new Error('LLM 返回空内容')

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('LLM 返回内容无法解析为 JSON')
    parsed = JSON.parse(match[0])
  }

  const result = IntelReportSchema.safeParse(parsed)
  let verdict: VerdictCardData
  let timeline: TimelineCardData
  let achievements: AchievementsCardData
  let darkside: DarksideCardData
  let gameplay: GameplayCardData
  let trends: TrendCardData
  if (result.success) {
    verdict = result.data.verdict as VerdictCardData
    timeline = result.data.timeline as TimelineCardData
    achievements = result.data.achievements as AchievementsCardData
    darkside = result.data.darkside as DarksideCardData
    gameplay = result.data.gameplay as GameplayCardData
    trends = normalizeTrends(result.data.trends)
  } else {
    console.log(
      '[llmEngine] Zod 校验警告（已宽松处理）:',
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    )
    const p = (parsed ?? {}) as Record<string, unknown>
    verdict = normalizeVerdict(p.verdict)
    timeline = normalizeTimeline(p.timeline)
    achievements = normalizeAchievements(p.achievements)
    darkside = normalizeDarkside(p.darkside)
    gameplay = normalizeGameplay(p.gameplay)
    trends = normalizeTrends(p.trends)
  }

  const cards: IntelCard[] = [
    { cardType: 'verdict', payload: verdict },
    { cardType: 'timeline', payload: timeline },
    { cardType: 'achievements', payload: achievements },
  ]
  if (trends.trends.length > 0) {
    cards.push({ cardType: 'trends', payload: trends })
  }
  cards.push(
    { cardType: 'darkside', payload: darkside },
    { cardType: 'gameplay', payload: gameplay },
  )

  console.log(`[llmEngine] 解析成功: ${cards.length} 张卡片`)
  return cards
}

/**
 * Agent 模式入口 — ReAct 多轮研究
 *
 * 通过 onProgress 回调推送 agent 进度事件给 SSE 层。
 * 失败时自动降级到单次调用模式 generateIntelCards。
 *
 * @param onProgress 进度回调
 */
export async function generateIntelCardsWithAgent(
  query: string,
  entityType: EntityType,
  options: { includeDomains?: string[]; excludeDomains?: string[] },
  onProgress?: (event: AgentProgressEvent) => void,
): Promise<{ cards: IntelCard[]; sources: IntelSource[]; images: string[]; sourceStats: SourceStats }> {
  console.log(`[llmEngine] Agent 模式启动: query=${query}, type=${entityType}`)

  try {
    const {
      rawLLMOutput,
      sources,
      images,
      steps,
      bySource,
      coveredDimensions,
      timeSpan,
    } = await runResearchAgent(
      query,
      entityType,
      options,
      onProgress,
    )

    console.log(`[agent] 完成: ${steps} 轮搜索, ${sources.length} 个来源, ${images.length} 张图片`)

    // 解析最终 LLM 输出
    const cards = parseLLMOutput(rawLLMOutput)

    // PRD-01 M3：聚合信源构成统计（供前端"深度感知"展示）
    const sourceStats: SourceStats = {
      totalSources: sources.length,
      bySource,
      coveredDimensions,
      timeSpan,
    }

    return { cards, sources, images, sourceStats }
  } catch (err) {
    console.warn('[llmEngine] Agent 失败，降级到单次模式:', (err as Error).message)
    // 降级到原单次模式（无 sourceStats，前端兼容空值）
    const fallback = await generateIntelCards(query, entityType)
    return {
      ...fallback,
      sourceStats: {
        totalSources: fallback.sources.length,
        bySource: {},
        coveredDimensions: [],
      },
    }
  }
}

/**
 * 六维并行查询规划（PRD-01 FR-02）
 *
 * 把单一 query 分解为「维度 × 语言」的子查询矩阵，并行 fan-out 到适配器集合。
 * 每个维度对应一张情报卡片的取材方向：
 *   verdict / timeline / achievements / trends / darkside / gameplay
 *
 * 实现：
 * - 主路径：LLM（DeepSeek）生成维度子查询词（复用 researchAgent.callLLM + extractJSON）
 * - 降级路径：LLM 失败/超时 → 模板拼接（按 entityType 分模板）
 *
 * 与 ReAct 循环结合：
 * - 首轮：planQueries 生成 6 维子查询，串行/并行执行（控成本）
 * - 后续轮：decideNextAction 针对缺口维度补搜（单查询，不走 planner）
 */
import type { EntityType } from '@shared/types.js'
import type { Dimension } from './sources/types.js'
import { callLLM, extractJSON } from './llmClient.js'

/** 子查询计划项 */
export interface PlannedQuery {
  dimension: Dimension
  query: string
  lang: 'zh' | 'en'
}

/** 六维定义（顺序固定，与卡片展示顺序一致） */
export const ALL_DIMENSIONS: Dimension[] = [
  'verdict',
  'timeline',
  'achievements',
  'trends',
  'darkside',
  'gameplay',
]

/** 维度中文标签（模板拼接用） */
const DIMENSION_LABELS: Record<Dimension, string> = {
  verdict: '定性',
  timeline: '发展历程 关键节点',
  achievements: '营收 市值 出货量 数据 战绩',
  trends: '近三年 增长 趋势',
  darkside: '争议 反垄断 做空 风险',
  gameplay: '竞争对手 供应链 博弈 利益相关方',
}

/** 维度英文关键词（英文子查询用） */
const DIMENSION_KEYWORDS_EN: Record<Dimension, string> = {
  verdict: 'overview company profile',
  timeline: 'history milestones timeline',
  achievements: 'revenue market cap financials metrics',
  trends: 'growth trend 2023 2024 2025',
  darkside: 'controversy antitrust risk lawsuit',
  gameplay: 'competitors supply chain stakeholders',
}

/** 实体类型中英标签（模板拼接用） */
const ENTITY_LABELS: Record<EntityType, { zh: string; en: string }> = {
  HUMAN: { zh: '人物', en: 'person' },
  EVENT: { zh: '事件', en: 'event' },
  ITEM: { zh: '产品/公司', en: 'company/product' },
}

/**
 * 模板兜底：LLM 不可用/失败时，按维度+语言拼子查询。
 * 不依赖网络，保证可用性。
 */
export function templatePlan(query: string, entityType: EntityType): PlannedQuery[] {
  // 兜底仅生成中文子查询（每维度1子查询，控成本）
  // entityType 保留用于未来按实体类型差异化兜底，当前统一中文
  void entityType
  const plans: PlannedQuery[] = []
  for (const dim of ALL_DIMENSIONS) {
    plans.push({
      dimension: dim,
      query: `${query} ${DIMENSION_LABELS[dim]}`,
      lang: 'zh',
    })
  }
  return plans
}

const PLAN_SYSTEM_PROMPT = `你是查询规划器。把用户查询分解为 6 个维度的子查询，每个维度仅生成 1 个子查询。

## 维度定义
- verdict: 核心定性（是谁/是什么）
- timeline: 关键时间节点
- achievements: 量化成就/数据
- trends: 发展趋势/增长数据
- darkside: 争议/负面/风险
- gameplay: 利益相关方/博弈

## 规则
- 子查询要具体、聚焦，适合搜索引擎
- 每个维度仅生成 1 个子查询（控制 API 消耗）
- 语言选择策略：
  * EVENT 类型（事件）→ 用中文查询
  * HUMAN/ITEM 类型（人物/产品公司）→ 若实体有通用英文名则用英文查询（如「英伟达」→「Nvidia revenue」），否则用中文
- 英文查询优先使用实体英文名以获取更权威的国际信源

## 输出 JSON
{
  "plans": [
    { "dimension": "verdict", "query": "子查询", "lang": "zh" },
    ...
  ]
}`

/**
 * LLM 生成六维子查询计划。
 * 失败/超时 → 自动降级到 templatePlan。
 *
 * @param query 用户原始查询
 * @param entityType 实体类型
 * @param timeoutMs LLM 超时（默认 8s，避免阻塞 ReAct 主循环）
 */
export async function planQueries(
  query: string,
  entityType: EntityType,
  timeoutMs = 8000,
): Promise<PlannedQuery[]> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const content = await Promise.race([
      callLLM(
        PLAN_SYSTEM_PROMPT,
        `查询: ${query}（类型: ${ENTITY_LABELS[entityType].zh}）`,
        { temperature: 0.3, maxTokens: 800, jsonMode: true },
      ),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new Error('queryPlanner LLM timeout')),
        )
      }),
    ]).finally(() => clearTimeout(timer))

    const parsed = extractJSON(content) as {
      plans?: Array<{ dimension: string; query?: string; lang?: string }>
    }
    const rawPlans = Array.isArray(parsed.plans) ? parsed.plans : []

    const plans: PlannedQuery[] = []
    const seenDims = new Set<Dimension>() // 每维度仅取首个，避免 LLM 误返回多语言
    for (const p of rawPlans) {
      if (typeof p.dimension !== 'string') continue
      if (!ALL_DIMENSIONS.includes(p.dimension as Dimension)) continue
      const dim = p.dimension as Dimension
      if (seenDims.has(dim)) continue // 每维度仅1子查询
      if (typeof p.query === 'string' && p.query.trim()) {
        seenDims.add(dim)
        plans.push({
          dimension: dim,
          query: p.query.trim(),
          lang: p.lang === 'en' ? 'en' : 'zh',
        })
      }
    }

    // 兜底：LLM 返回不完整 → 用模板补齐缺失维度
    if (plans.length < 6) {
      const fallback = templatePlan(query, entityType)
      for (const fp of fallback) {
        if (!seenDims.has(fp.dimension)) {
          seenDims.add(fp.dimension)
          plans.push(fp)
        }
      }
    }

    console.log(`[queryPlanner] LLM 规划: ${plans.length} 个子查询`)
    return plans
  } catch (err) {
    console.warn(`[queryPlanner] LLM 规划失败，降级模板:`, (err as Error).message)
    return templatePlan(query, entityType)
  }
}

/**
 * 按维度分组子查询（供 researchAgent 串行执行每个维度、维度内并行多源）。
 */
export function groupByDimension(plans: PlannedQuery[]): Map<Dimension, PlannedQuery[]> {
  const map = new Map<Dimension, PlannedQuery[]>()
  for (const p of plans) {
    if (!map.has(p.dimension)) map.set(p.dimension, [])
    map.get(p.dimension)!.push(p)
  }
  return map
}

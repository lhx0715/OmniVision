/**
 * 多信源适配器抽象层（PRD-01 FR-01）
 *
 * 统一各信源差异，使 researchAgent 可按维度 × 实体类型路由到最优信源组合，
 * 并支持无 key 自动降级跳过（与现有 hasLLM() 降级一致）。
 */
import type { EntityType } from '../../../shared/types.js'

export type SourceName = 'tavily' | 'exa' | 'github' | 'news' | 'social'

export type Dimension =
  | 'verdict'
  | 'timeline'
  | 'achievements'
  | 'trends'
  | 'darkside'
  | 'gameplay'

/** 信源返回的原始文档（归一化前） */
export interface RawDoc {
  title: string
  url: string
  content: string // 正文/摘要
  publishedAt?: string // 发布时间（用于新鲜度）
  source: SourceName
  rank: number // 该源内部返回名次（0-based，用于 RRF）
  score?: number // 该源自带相关性分（可选）
  lang?: 'zh' | 'en' | string
  meta?: Record<string, unknown> // 如 GitHub stars/forks
}

/** 单次适配器检索选项 */
export interface SearchOpts {
  entityType: EntityType
  dimension?: Dimension // 维度路由用
  includeDomains?: string[] // B 类强制白名单
  excludeDomains?: string[] // C 类排除黑名单
  maxResults?: number
}

/** 适配器检索结果：docs 为文本文档，images/answer 仅部分源（Tavily）提供 */
export interface AdapterSearchResult {
  docs: RawDoc[]
  images?: string[]
  answer?: string // Tavily include_answer 的 AI 摘要
}

/** 信源适配器统一接口 */
export interface SourceAdapter {
  name: SourceName
  /** 是否适用于该实体类型/维度（路由用） */
  supports(entityType: EntityType, dimension: Dimension): boolean
  /** 执行检索；无 key / 限流 / 失败时返回空 docs，不抛错 */
  search(query: string, opts: SearchOpts): Promise<AdapterSearchResult>
}

/** 多源并行召回聚合结果 */
export interface RecallResult {
  docs: RawDoc[] // 去重 + RRF 融合后的有序文档
  bySource: Record<string, number> // 各源命中数（去重前）
  images: string[] // 累积图片（Tavily 提供）
  answer?: string // Tavily AI 摘要（若有）
  perSource: { source: SourceName; docs: RawDoc[] }[] // 各源原始 ranked list（RRF 用）
}

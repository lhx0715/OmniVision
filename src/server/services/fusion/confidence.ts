/**
 * 跨源印证 + 新鲜度 → 置信度分级（PRD-01 FR-03 第4步）
 *
 * 升级 researchAgent.crossValidate：从"内容前 20 字相同"粗粒度合并，
 * 改为基于 crossSources 数量 + 域名权威 + 时间新鲜度的综合判定。
 *
 * 分级规则：
 * - high:   ≥2 个不同信源印证 OR 单一权威源（gov/edu/官媒/权威财经）
 * - medium: 单源 + 非权威但有明确时间 + 时间新鲜（< 365 天）
 * - low:    单源 + 无时间 OR 单源 + 陈旧（> 730 天）OR 无 URL 来源
 *
 * 输出供 IntelSource.confidence 与卡片区显示徽标用。
 */
import type { IntelSource } from '@shared/types.js'
import type { RawDoc } from '../sources/types.js'
import { getDomainWeight } from './domainAuthority.js'

export type Confidence = 'high' | 'medium' | 'low'

/** 权威标签集合：单源命中即可视为 high */
const AUTHORITATIVE_LABELS = new Set([
  'gov',
  'edu',
  'academic',
  'official-media',
  'mainstream-media',
  'official-doc',
])

/** 一年毫秒数（用于新鲜度判定） */
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

/** 解析 publishedAt 为时间戳；失败返回 null */
function parseTimestamp(publishedAt?: string): number | null {
  if (!publishedAt || typeof publishedAt !== 'string') return null
  const t = Date.parse(publishedAt)
  return Number.isNaN(t) ? null : t
}

/**
 * 单文档置信度计算（基于 crossSources + 域名权威 + 新鲜度）。
 * @param doc 已经过 dedupe 的 RawDoc（meta.crossSources 可能存在）
 */
export function computeDocConfidence(doc: RawDoc): Confidence {
  // 1. 跨源印证：meta.crossSources 由 registry.searchAll 回填
  const crossSources = Array.isArray(doc.meta?.crossSources)
    ? (doc.meta!.crossSources as unknown as string[])
    : []
  if (crossSources.length >= 2) return 'high'

  // 2. 单源权威域：gov/edu/官媒/权威财经 → high
  const { weight, label } = getDomainWeight(doc.url)
  if (weight >= 1.4 || AUTHORITATIVE_LABELS.has(label)) return 'high'

  // 3. 新鲜度判定
  const ts = parseTimestamp(doc.publishedAt)
  if (ts === null) return 'low' // 无时间 → low
  const age = Date.now() - ts
  if (age < YEAR_MS) return 'medium' // < 1 年 → medium
  if (age < 2 * YEAR_MS) return 'low' // 1~2 年 → low
  return 'low' // > 2 年 → low
}

/**
 * 批量给 IntelSource 附加 confidence / sourceCount。
 * 用于 researchAgent 在召回后增强来源元信息。
 */
export function enrichSourcesWithConfidence(
  sources: IntelSource[],
  docsByDomain: Map<string, RawDoc> = new Map(),
): IntelSource[] {
  return sources.map((s) => {
    // 优先从 docsByDomain 取已计算的 crossSources；否则基于 source 字段推断
    const key = s.url
    const doc = docsByDomain.get(key)
    if (doc) {
      const crossSources = Array.isArray(doc.meta?.crossSources)
        ? (doc.meta!.crossSources as unknown as string[])
        : []
      const confidence = computeDocConfidence(doc)
      return {
        ...s,
        confidence,
        sourceCount: Math.max(1, crossSources.length),
      }
    }

    // 回退：单源无 crossSources 信息 → 按域名权威判定
    const { weight, label } = getDomainWeight(s.url)
    const confidence: Confidence =
      weight >= 1.4 || AUTHORITATIVE_LABELS.has(label) ? 'high' : 'low'
    return {
      ...s,
      confidence,
      sourceCount: 1,
    }
  })
}

/**
 * 统计 high 置信度占比（PRD-01 验收标准：≥ 40%）。
 * 供日志/调试/未来仪表盘用。
 */
export function confidenceStats(sources: IntelSource[]): {
  total: number
  high: number
  medium: number
  low: number
  highRatio: number
} {
  let high = 0
  let medium = 0
  let low = 0
  for (const s of sources) {
    if (s.confidence === 'high') high++
    else if (s.confidence === 'medium') medium++
    else low++
  }
  const total = sources.length
  return {
    total,
    high,
    medium,
    low,
    highRatio: total > 0 ? high / total : 0,
  }
}

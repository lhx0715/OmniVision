/**
 * RRF 多路融合排序（PRD-01 FR-03 第2步）
 *
 * Reciprocal Rank Fusion：多个信源各自返回有序列表，用 RRF 合并。
 * 同一文档被多个源命中 → 得分叠加，天然偏向"跨源共识"。
 *
 *   RRF(doc) = Σ_over_sources  weight_source / (k + rank_source(doc))
 *
 * k=60 经验值（原论文推荐）。
 *
 * M2 升级：weight_source = sourceTypeWeight × domainAuthorityWeight
 * 使学术/官方/权威财经域名在融合中获得更高得分。
 */
import type { RawDoc, SourceName } from '../sources/types.js'
import { normalizeUrl } from './dedupe.js'
import { computeDocWeight } from './domainAuthority.js'

const K = 60

/** 默认信源权重（与 getSourceTypeWeight 一致，保留供 registry 兼容引用） */
export const DEFAULT_SOURCE_WEIGHTS: Record<SourceName, number> = {
  searxng: 1.0, // 自建元搜索，聚合多源，标准基准
  serper: 1.0, // Google 真实 SERP，质量高
  tavily: 1.0,
  exa: 1.1, // 语义/研究源略加权
  duckduckgo: 0.8, // Instant Answer 兜底，覆盖有限略降权
  openverse: 0, // 纯图片源，不贡献文本 docs，不参与 RRF 融合（仅提供 images）
  github: 1.1, // 代码/官方仓库
  news: 1.2,
  social: 0.6, // 社媒/自媒体低权
}

/**
 * RRF 融合多个有序列表。
 * @param rankedLists 每个源的有序 RawDoc 列表（rank = 数组下标）
 * @param useDomainAuthority 是否启用域名权威加权（默认 true，M2 升级）
 * @returns 融合后按 RRF 得分降序的文档列表
 */
export function rrfFuse(
  rankedLists: { source: SourceName; docs: RawDoc[] }[],
  useDomainAuthority = true,
): RawDoc[] {
  const scores = new Map<string, number>() // normalizedUrl → score
  const docMap = new Map<string, RawDoc>() // normalizedUrl → 首个 doc（保留元信息）

  for (const { source, docs } of rankedLists) {
    docs.forEach((doc, rank) => {
      const key = normalizeUrl(doc.url)
      // M2：综合权重 = sourceType × domainAuthority（computeDocWeight 已封装）
      const w = useDomainAuthority
        ? computeDocWeight(doc)
        : (DEFAULT_SOURCE_WEIGHTS[source] ?? 1.0)
      const contribution = w / (K + rank)
      scores.set(key, (scores.get(key) ?? 0) + contribution)
      // 保留首个出现的 doc（rank 最优）；但若后来者有 publishedAt 而前者无，补上
      const existing = docMap.get(key)
      if (!existing) {
        docMap.set(key, doc)
      } else if (!existing.publishedAt && doc.publishedAt) {
        docMap.set(key, { ...existing, publishedAt: doc.publishedAt })
      }
    })
  }

  return [...docMap.entries()]
    .map(([key, doc]) => ({ doc, score: scores.get(key) ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.doc)
}

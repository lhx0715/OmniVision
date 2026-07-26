/**
 * 域名权威表 + 信源类型加权（PRD-01 FR-03 第3步）
 *
 * 与 DEFAULT_SOURCE_WEIGHTS 叠加，使学术/官方/权威财经在 RRF 中获得更高得分，
 * 内容农场/聚合站低权重。与 riskGuard 的 B 类白名单/C 类黑名单叠加（互不冲突）。
 *
 * 设计原则：
 * - 高权重（1.4~1.6）：.gov/.edu/官媒/权威财经/学术期刊
 * - 中权重（1.0~1.2）：主流媒体/知名技术社区/官方文档
 * - 低权重（0.4~0.7）：内容农场/聚合站/自媒体平台
 * - 默认（1.0）：未命中表
 */
import type { RawDoc, SourceName } from '../sources/types.js'

/** 域名权威表：domain pattern → 权重 */
const DOMAIN_AUTHORITY: Array<{ pattern: string; weight: number; label: string }> = [
  // === 高权重：政府 / 学术 / 官媒 / 权威财经（1.4~1.6）===
  { pattern: '.gov', weight: 1.6, label: 'gov' },
  { pattern: '.gov.cn', weight: 1.6, label: 'gov' },
  { pattern: '.edu', weight: 1.5, label: 'edu' },
  { pattern: '.edu.cn', weight: 1.5, label: 'edu' },
  { pattern: 'arxiv.org', weight: 1.5, label: 'academic' },
  { pattern: 'nature.com', weight: 1.5, label: 'academic' },
  { pattern: 'science.org', weight: 1.5, label: 'academic' },
  { pattern: 'sciencedirect.com', weight: 1.5, label: 'academic' },
  { pattern: 'ieee.org', weight: 1.4, label: 'academic' },
  { pattern: 'acm.org', weight: 1.4, label: 'academic' },
  { pattern: 'xinhuanet.com', weight: 1.45, label: 'official-media' },
  { pattern: 'people.com.cn', weight: 1.45, label: 'official-media' },
  { pattern: 'cctv.com', weight: 1.45, label: 'official-media' },
  { pattern: 'chinadaily.com.cn', weight: 1.4, label: 'official-media' },
  { pattern: 'reuters.com', weight: 1.5, label: 'mainstream-media' },
  { pattern: 'bloomberg.com', weight: 1.5, label: 'mainstream-media' },
  { pattern: 'ft.com', weight: 1.45, label: 'mainstream-media' },
  { pattern: 'wsj.com', weight: 1.45, label: 'mainstream-media' },
  { pattern: 'nytimes.com', weight: 1.4, label: 'mainstream-media' },
  { pattern: 'economist.com', weight: 1.4, label: 'mainstream-media' },
  { pattern: 'caixin.com', weight: 1.45, label: 'mainstream-media' },
  { pattern: 'thepaper.cn', weight: 1.2, label: 'mainstream-media' },

  // === 中权重：主流媒体 / 知名技术社区 / 官方文档（1.0~1.2）===
  { pattern: 'github.com', weight: 1.2, label: 'tech-community' },
  { pattern: 'stackoverflow.com', weight: 1.1, label: 'tech-community' },
  { pattern: 'dev.to', weight: 1.0, label: 'tech-community' },
  { pattern: 'medium.com', weight: 0.95, label: 'blog-platform' },
  { pattern: 'wikipedia.org', weight: 1.15, label: 'encyclopedia' },
  { pattern: 'mdn.mozilla.org', weight: 1.2, label: 'official-doc' },
  { pattern: 'developer.mozilla.org', weight: 1.2, label: 'official-doc' },
  { pattern: 'microsoft.com', weight: 1.2, label: 'official-doc' },
  { pattern: 'apple.com', weight: 1.2, label: 'official-doc' },
  { pattern: 'nvidia.com', weight: 1.2, label: 'official-doc' },
  { pattern: 'openai.com', weight: 1.2, label: 'official-doc' },
  { pattern: 'anthropic.com', weight: 1.2, label: 'official-doc' },
  { pattern: '36kr.com', weight: 1.1, label: 'tech-media' },
  { pattern: 'huxiu.com', weight: 1.05, label: 'tech-media' },
  { pattern: 'ssrn.com', weight: 1.4, label: 'academic' },

  // === 低权重：内容农场 / 聚合站 / 自媒体平台（0.4~0.8）===
  { pattern: 'zhihu.com', weight: 0.85, label: 'qa-platform' },
  { pattern: 'csdn.net', weight: 0.6, label: 'content-farm' },
  { pattern: 'jianshu.com', weight: 0.6, label: 'blog-platform' },
  { pattern: 'toutiao.com', weight: 0.7, label: 'aggregator' },
  { pattern: 'sohu.com', weight: 0.7, label: 'aggregator' },
  { pattern: 'sina.com.cn', weight: 0.85, label: 'mainstream-media' },
  { pattern: 'qq.com', weight: 0.85, label: 'mainstream-media' },
  { pattern: '163.com', weight: 0.8, label: 'mainstream-media' },
  { pattern: 'baidu.com', weight: 0.7, label: 'aggregator' },
  { pattern: 'buzzfeed.com', weight: 0.5, label: 'content-farm' },
  { pattern: 'hubpages.com', weight: 0.5, label: 'content-farm' },
]

/** 从 URL 提取主域名（小写，去 www.） */
export function extractDomain(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * 取域名权威权重。
 * 命中表 → 对应权重；未命中 → 默认 1.0
 * 多个 pattern 命中时取最高权重（避免低权 pattern 覆盖高权）
 */
export function getDomainWeight(url: string): { weight: number; label: string } {
  const domain = extractDomain(url)
  if (!domain) return { weight: 1.0, label: 'unknown' }

  let best: { weight: number; label: string } | null = null
  for (const entry of DOMAIN_AUTHORITY) {
    if (domain === entry.pattern || domain.endsWith('.' + entry.pattern)) {
      if (!best || entry.weight > best.weight) {
        best = { weight: entry.weight, label: entry.label }
      }
    }
  }
  return best ?? { weight: 1.0, label: 'unknown' }
}

/**
 * 信源类型权重（与 DEFAULT_SOURCE_WEIGHTS 配合使用）。
 * 学术/官方 > 主流媒体 > 通用检索 > 社媒/自媒体
 */
export function getSourceTypeWeight(source: SourceName): number {
  switch (source) {
    case 'tavily':
      return 1.0 // 通用检索
    case 'exa':
      return 1.1 // 语义/研究源略加权
    case 'github':
      return 1.1 // 代码/官方仓库
    case 'news':
      return 1.2 // 新闻源加权
    case 'social':
      return 0.6 // 社媒/自媒体低权
    default:
      return 1.0
  }
}

/**
 * 综合权重：sourceType × domainAuthority
 * 用于 RRF 融合排序（替代纯 DEFAULT_SOURCE_WEIGHTS）
 */
export function computeDocWeight(doc: RawDoc): number {
  const sourceWeight = getSourceTypeWeight(doc.source)
  const domainWeight = getDomainWeight(doc.url).weight
  return sourceWeight * domainWeight
}

/** 域名标签集合（供前端"信源构成条"按权威级别分组展示） */
export function getAuthorityLabel(url: string): string {
  return getDomainWeight(url).label
}

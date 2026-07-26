/**
 * Tavily 适配器（PRD-01 FR-01）
 *
 * 从 researchAgent.ts 的 tavilySearch 迁移而来。保留 advanced 深度、
 * include_answer、include_images 与 includeDomains/excludeDomains 信源路由。
 * 唯一同时返回 images 的源（供影像档案 Gallery）。
 */
import type { IntelSource } from '@shared/types.js'
import type { SourceAdapter, AdapterSearchResult, RawDoc, SearchOpts } from './types.js'

interface TavilyResult {
  title: string
  url: string
  content: string
  score?: number
}

interface TavilySearchResponse {
  answer?: string
  results?: TavilyResult[]
  images?: unknown
}

const TAVILY_URL = 'https://api.tavily.com/search'
const DEFAULT_MAX = 6

export const tavilyAdapter: SourceAdapter = {
  name: 'tavily',

  supports(): boolean {
    // Tavily 是通用源，所有实体类型/维度均适用
    return true
  },

  async search(query: string, opts: SearchOpts): Promise<AdapterSearchResult> {
    const apiKey = process.env.TAVILY_API_KEY ?? ''
    if (!apiKey) return { docs: [], images: [] }

    const body: Record<string, unknown> = {
      api_key: apiKey,
      query,
      max_results: opts.maxResults ?? DEFAULT_MAX,
      include_answer: true,
      include_images: true,
      search_depth: 'advanced',
    }
    if (opts.includeDomains && opts.includeDomains.length > 0) {
      body.include_domains = opts.includeDomains
    }
    if (opts.excludeDomains && opts.excludeDomains.length > 0) {
      body.exclude_domains = opts.excludeDomains
    }

    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn(`[sources] Tavily 搜索失败: HTTP ${res.status}`)
      return { docs: [], images: [] }
    }

    const data = (await res.json()) as TavilySearchResponse
    const results = data.results ?? []
    const docs: RawDoc[] = results.map((r, i) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      source: 'tavily',
      rank: i,
      score: typeof r.score === 'number' ? r.score : undefined,
    }))

    const rawImages = data.images
    const images: string[] = Array.isArray(rawImages)
      ? rawImages.filter((u): u is string => typeof u === 'string').slice(0, 12)
      : []

    return { docs, images, answer: data.answer }
  },
}

/** RawDoc → IntelSource（向后兼容：仅填 title/url，附加可选元信息） */
export function rawDocToIntelSource(d: RawDoc): IntelSource {
  return {
    title: d.title,
    url: d.url,
    source: d.source,
    publishedAt: d.publishedAt,
  }
}

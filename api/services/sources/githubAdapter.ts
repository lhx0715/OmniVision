/**
 * GitHub 适配器（PRD-01 FR-01）
 *
 * GitHub search/repositories：产品/技术热度、Star 增长。
 * 无 GITHUB_TOKEN 时匿名调用（10 次/分，单查询 1 次足够）；有 token 则提额。
 * 仅适用于 ITEM 类型且 achievements/trends 维度。
 */
import type { SourceAdapter, AdapterSearchResult, RawDoc, SearchOpts } from './types.js'

interface GitHubRepo {
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  forks_count: number
  language: string | null
  created_at: string
  updated_at: string
}

interface GitHubSearchResponse {
  total_count?: number
  items?: GitHubRepo[]
}

const GITHUB_URL = 'https://api.github.com/search/repositories'
const DEFAULT_MAX = 5

export const githubAdapter: SourceAdapter = {
  name: 'github',

  supports(entityType, dimension): boolean {
    // 仅产品/技术实体，且用于成就（热度）与趋势（增长）
    return entityType === 'ITEM' && (dimension === 'achievements' || dimension === 'trends')
  },

  async search(query: string, opts: SearchOpts): Promise<AdapterSearchResult> {
    const token = process.env.GITHUB_TOKEN ?? ''
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'OmniVision-Agent',
    }
    if (token) headers.Authorization = `Bearer ${token}`

    const params = new URLSearchParams({
      q: query,
      sort: 'stars',
      order: 'desc',
      per_page: String(opts.maxResults ?? DEFAULT_MAX),
    })

    const res = await fetch(`${GITHUB_URL}?${params.toString()}`, { headers })
    if (!res.ok) {
      // 匿名限流（403）或失败时降级为空，不阻塞主流程
      console.warn(`[sources] GitHub 搜索失败: HTTP ${res.status}`)
      return { docs: [] }
    }

    const data = (await res.json()) as GitHubSearchResponse
    const items = data.items ?? []
    const docs: RawDoc[] = items.map((r, i) => ({
      title: r.full_name,
      url: r.html_url,
      content: r.description ?? r.full_name,
      publishedAt: r.updated_at,
      source: 'github',
      rank: i,
      lang: 'en',
      meta: {
        stars: r.stargazers_count,
        forks: r.forks_count,
        language: r.language,
        createdAt: r.created_at,
      },
    }))

    return { docs }
  },
}

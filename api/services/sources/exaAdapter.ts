/**
 * Exa 适配器（PRD-01 FR-01）
 *
 * Exa neural search：语义/研究/话题簇发现，对学生/科普/事件脉络强。
 * 无 EXA_API_KEY 时自动降级返回空（registry 会跳过）。
 */
import type { SourceAdapter, AdapterSearchResult, RawDoc, SearchOpts, Dimension } from './types.js'

interface ExaSearchResult {
  title?: string
  url?: string
  text?: string
  publishedDate?: string
  score?: number
}

interface ExaSearchResponse {
  results?: ExaSearchResult[]
}

const EXA_URL = 'https://api.exa.ai/search'
const DEFAULT_MAX = 6

// Exa 擅长语义/研究/事件脉络，对纯博弈/反面维度弱
const SUPPORTED_DIMS: Set<Dimension> = new Set(['verdict', 'timeline', 'achievements', 'trends'])

export const exaAdapter: SourceAdapter = {
  name: 'exa',

  supports(_entityType, dimension): boolean {
    return SUPPORTED_DIMS.has(dimension)
  },

  async search(query: string, opts: SearchOpts): Promise<AdapterSearchResult> {
    const apiKey = process.env.EXA_API_KEY ?? ''
    if (!apiKey) return { docs: [] }

    const body: Record<string, unknown> = {
      query,
      numResults: opts.maxResults ?? DEFAULT_MAX,
      contents: { text: { maxCharacters: 2000 } },
      type: 'neural',
    }

    const res = await fetch(EXA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn(`[sources] Exa 搜索失败: HTTP ${res.status}`)
      return { docs: [] }
    }

    const data = (await res.json()) as ExaSearchResponse
    const results = data.results ?? []
    const docs: RawDoc[] = results.map((r, i): RawDoc => ({
      title: r.title ?? r.url ?? '',
      url: r.url ?? '',
      content: r.text ?? '',
      publishedAt: r.publishedDate,
      source: 'exa',
      rank: i,
      score: typeof r.score === 'number' ? r.score : undefined,
      lang: 'en',
    })).filter((d) => d.url)

    return { docs }
  },
}

/**
 * SearXNG 适配器（大会主力源）
 *
 * SearXNG 是开源自托管元搜索引擎，聚合 Google/Bing/DuckDuckGo 等 70+ 搜索引擎结果。
 * 完全免费、无调用上限——大会突发流量场景下最稳的方案。
 *
 * 部署：见 docker/searxng/（docker compose up -d 即可）。
 * 配置：SEARXNG_URL 指向自建实例（如 http://localhost:8080），无需 API key。
 *
 * 返回 JSON 格式需在 settings.yml 中启用 search.formats: [html, json]。
 */
import type { SourceAdapter, AdapterSearchResult, RawDoc, SearchOpts } from './types.js'
import { fetchWithTimeout, isAbortError } from '../httpUtils.js'
import { markRateLimited, parseRetryAfter, recordSuccess } from '../quotaGuard.js'

interface SearXNGResult {
  url?: string
  title?: string
  content?: string
  engine?: string
  score?: number
  publishedDate?: string
}

interface SearXNGResponse {
  results?: SearXNGResult[]
  unresponsive_engines?: unknown
  number_of_results?: number
}

const DEFAULT_MAX = 8 // SearXNG 免费无限，可适当多取

export const searxngAdapter: SourceAdapter = {
  name: 'searxng',

  supports(): boolean {
    // 通用元搜索源，所有实体类型/维度均适用
    return true
  },

  async search(query: string, opts: SearchOpts): Promise<AdapterSearchResult> {
    const baseUrl = process.env.SEARXNG_URL?.replace(/\/$/, '')
    if (!baseUrl) return { docs: [] }

    const params = new URLSearchParams({
      q: query,
      format: 'json',
      categories: 'general',
      pageno: '1',
    })
    if (opts.maxResults && opts.maxResults > 0) {
      // SearXNG 无精确 num 参数，取引擎默认；这里用于客户端裁剪
    }
    const maxResults = opts.maxResults ?? DEFAULT_MAX

    let res: Response
    try {
      res = await fetchWithTimeout(
        `${baseUrl}/search?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            // 部分 SearXNG 实例要求 UA，避免被反爬拦截
            'User-Agent': 'OmniVision-Agent/1.0',
          },
        },
        15000,
      )
    } catch (err) {
      console.warn(
        `[sources] SearXNG 搜索${isAbortError(err) ? '超时' : '失败'}:`,
        (err as Error).message,
      )
      return { docs: [] }
    }

    if (!res.ok) {
      // 429/432 限流：触发熔断，让流量落到其他源
      if (res.status === 429 || res.status === 432 || res.status === 503) {
        const retryAfter = parseRetryAfter(res)
        markRateLimited('searxng', retryAfter, `HTTP ${res.status}`)
      } else {
        console.warn(`[sources] SearXNG 搜索失败: HTTP ${res.status}`)
      }
      return { docs: [] }
    }

    let data: SearXNGResponse
    try {
      data = (await res.json()) as SearXNGResponse
    } catch (err) {
      // 非法 JSON（如实例返回了 HTML 错误页）
      console.warn('[sources] SearXNG 响应解析失败:', (err as Error).message)
      return { docs: [] }
    }

    const results = (data.results ?? []).filter((r) => r.url && r.title)
    const docs: RawDoc[] = results.slice(0, maxResults).map((r, i) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      content: r.content ?? '',
      publishedAt: r.publishedDate,
      source: 'searxng',
      rank: i,
      score: typeof r.score === 'number' ? r.score : undefined,
      meta: r.engine ? { engine: r.engine } : undefined,
    }))

    recordSuccess('searxng')
    return { docs }
  },
}

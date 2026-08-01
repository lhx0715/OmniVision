/**
 * DuckDuckGo 适配器（完全免费兜底源）
 *
 * 基于 DuckDuckGo Instant Answer API，无需注册、无需 API key、完全免费。
 * 作为"最后一道防线"：当 Tavily/Serper/Exa 全部额度耗尽或熔断时，
 * DuckDuckGo 仍能提供即时答案，保证召回不归零。
 *
 * 局限：Instant Answer API 主要返回事实性即时答案（AbstractText + RelatedTopics），
 * 对复杂/长尾查询覆盖有限——这正符合"兜底"定位，返回多少算多少，空也不影响其他源。
 *
 * 如需更完整的 DuckDuckGo 网页搜索结果，建议改用自建 SearXNG（其聚合了 DuckDuckGo）。
 */
import type { SourceAdapter, AdapterSearchResult, RawDoc, SearchOpts } from './types.js'
import { fetchWithTimeout, isAbortError } from '../httpUtils.js'
import { markRateLimited, parseRetryAfter, recordSuccess } from '../quotaGuard.js'

interface DDGRelatedTopic {
  Text?: string
  FirstURL?: string
  Icon?: { URL?: string }
  Topics?: DDGRelatedTopic[] // 嵌套分类
}

interface DDGResponse {
  AbstractText?: string
  AbstractURL?: string
  AbstractSource?: string
  Heading?: string
  RelatedTopics?: DDGRelatedTopic[]
  Definition?: string
  DefinitionURL?: string
  Answer?: string
  AnswerType?: string
}

const DDG_URL = 'https://api.duckduckgo.com/'
const DEFAULT_MAX = 6

export const duckduckgoAdapter: SourceAdapter = {
  name: 'duckduckgo',

  supports(): boolean {
    // 通用兜底源，所有实体类型/维度均适用
    return true
  },

  async search(query: string, opts: SearchOpts): Promise<AdapterSearchResult> {
    const maxResults = opts.maxResults ?? DEFAULT_MAX
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
      no_redirect: '1',
    })

    let res: Response
    try {
      res = await fetchWithTimeout(
        `${DDG_URL}?${params.toString()}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
        15000,
      )
    } catch (err) {
      console.warn(
        `[sources] DuckDuckGo 搜索${isAbortError(err) ? '超时' : '失败'}:`,
        (err as Error).message,
      )
      return { docs: [] }
    }

    if (!res.ok) {
      if (res.status === 429 || res.status === 503) {
        const retryAfter = parseRetryAfter(res)
        markRateLimited('duckduckgo', retryAfter, `HTTP ${res.status}`)
      } else {
        console.warn(`[sources] DuckDuckGo 搜索失败: HTTP ${res.status}`)
      }
      return { docs: [] }
    }

    let data: DDGResponse
    try {
      data = (await res.json()) as DDGResponse
    } catch (err) {
      console.warn('[sources] DuckDuckGo 响应解析失败:', (err as Error).message)
      return { docs: [] }
    }

    const docs: RawDoc[] = []

    // 1) Abstract：主即时答案（权威摘要）
    if (data.AbstractText && data.AbstractText.length > 0) {
      docs.push({
        title: data.Heading ?? query,
        url: data.AbstractURL ?? '',
        content: data.AbstractText,
        source: 'duckduckgo',
        rank: 0,
        meta: data.AbstractSource ? { source: data.AbstractSource } : undefined,
      })
    }

    // 2) Definition：备用定义
    if (docs.length < maxResults && data.Definition && data.Definition.length > 0) {
      docs.push({
        title: data.Heading ?? query,
        url: data.DefinitionURL ?? '',
        content: data.Definition,
        source: 'duckduckgo',
        rank: docs.length,
      })
    }

    // 3) Answer：简短答案
    if (docs.length < maxResults && data.Answer && data.Answer.length > 0) {
      docs.push({
        title: query,
        url: '',
        content: data.Answer,
        source: 'duckduckgo',
        rank: docs.length,
        meta: data.AnswerType ? { answerType: data.AnswerType } : undefined,
      })
    }

    // 4) RelatedTopics：相关条目（递归展开嵌套分类）
    if (docs.length < maxResults && data.RelatedTopics) {
      const flatten = (topics: DDGRelatedTopic[], out: DDGRelatedTopic[]): void => {
        for (const t of topics) {
          if (docs.length + out.length >= maxResults) break
          if (t.Text && t.FirstURL) {
            out.push(t)
          } else if (t.Topics && t.Topics.length > 0) {
            flatten(t.Topics, out)
          }
        }
      }
      const related: DDGRelatedTopic[] = []
      flatten(data.RelatedTopics, related)
      for (const t of related) {
        if (docs.length >= maxResults) break
        docs.push({
          title: t.Text?.slice(0, 80) ?? query,
          url: t.FirstURL ?? '',
          content: t.Text ?? '',
          source: 'duckduckgo',
          rank: docs.length,
        })
      }
    }

    recordSuccess('duckduckgo')
    return { docs }
  },
}

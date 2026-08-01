/**
 * Openverse 适配器（免费无限图片源）
 *
 * Openverse 是 WordPress 维护的开放图片搜索引擎，聚合 Wikimedia Commons、
 * Flickr、博物馆等数亿张 CC 授权图片。完全免费、无需 API key。
 *
 * 定位：纯图片源（docs 永远为空，仅提供 images），供影像档案 Gallery。
 * - 优势：人物/产品/地点/概念配图，版权干净（CC 授权），权威性高
 * - 匿名速率限制 20 次/分钟（注册可提至 100/分钟），大会场景足够
 *
 * 六维并行会重复调用同 query → 内部 query 缓存（10min TTL）避免重复请求 API，
 * 实际每查询只调用 Openverse API 一次。
 */
import type { SourceAdapter, AdapterSearchResult, SearchOpts } from './types.js'
import { fetchWithTimeout, isAbortError } from '../httpUtils.js'
import { markRateLimited, parseRetryAfter, recordSuccess } from '../quotaGuard.js'

interface OpenverseImage {
  url?: string // 源页面 URL（如 Flickr 页面）
  thumbnail?: string // 缩略图 URL
  url_foreign?: string // 图片文件直接 URL（可用于 <img src>）
  title?: string
  license?: string
  creator?: string
  source?: string
}

interface OpenverseResponse {
  result_count?: number
  results?: OpenverseImage[]
}

const OPENVERSE_URL = 'https://api.openverse.org/v1/images/'
const DEFAULT_MAX = 8

// 内部 query 缓存：六维并行同 query 只实际请求一次 API
interface ImageCacheEntry {
  images: string[]
  ts: number
}
const imageCache = new Map<string, ImageCacheEntry>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 分钟

function getCachedImages(query: string): string[] | null {
  const e = imageCache.get(query)
  if (!e) return null
  if (Date.now() - e.ts < CACHE_TTL_MS) return e.images
  imageCache.delete(query)
  return null
}

function setCachedImages(query: string, images: string[]): void {
  imageCache.set(query, { images, ts: Date.now() })
  // 简易 LRU：超过 200 条清理最早条目
  if (imageCache.size > 200) {
    const firstKey = imageCache.keys().next().value
    if (firstKey) imageCache.delete(firstKey)
  }
}

export const openverseAdapter: SourceAdapter = {
  name: 'openverse',

  supports(): boolean {
    // 纯图片源，所有维度都参与（由内部缓存避免六维重复请求 API）
    return true
  },

  async search(query: string, opts: SearchOpts): Promise<AdapterSearchResult> {
    // 先查内部缓存（六维并行命中，避免重复请求 Openverse API）
    const cached = getCachedImages(query)
    if (cached) {
      return { docs: [], images: cached }
    }

    const maxResults = opts.maxResults ?? DEFAULT_MAX
    const params = new URLSearchParams({
      q: query,
      page_size: String(maxResults),
      maturity: 'disabled', // 过滤成人内容
    })

    let res: Response
    try {
      res = await fetchWithTimeout(
        `${OPENVERSE_URL}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            // 标识自身，便于 Openverse 统计（匿名仍可用）
            'User-Agent': 'OmniVision-Agent/1.0',
          },
        },
        15000,
      )
    } catch (err) {
      console.warn(
        `[sources] Openverse 搜索${isAbortError(err) ? '超时' : '失败'}:`,
        (err as Error).message,
      )
      return { docs: [] }
    }

    if (!res.ok) {
      if (res.status === 429 || res.status === 503) {
        const retryAfter = parseRetryAfter(res)
        markRateLimited('openverse', retryAfter, `HTTP ${res.status}`)
      } else {
        console.warn(`[sources] Openverse 搜索失败: HTTP ${res.status}`)
      }
      return { docs: [] }
    }

    let data: OpenverseResponse
    try {
      data = (await res.json()) as OpenverseResponse
    } catch (err) {
      console.warn('[sources] Openverse 响应解析失败:', (err as Error).message)
      return { docs: [] }
    }

    const results = data.results ?? []
    const images: string[] = []
    for (const r of results) {
      // 优先用图片直接 URL（可用于 <img>），fallback 缩略图
      const imgUrl = r.url_foreign || r.thumbnail
      if (imgUrl && !images.includes(imgUrl)) {
        images.push(imgUrl)
      }
      if (images.length >= maxResults) break
    }

    // 写入内部缓存，供后续维度命中
    if (images.length > 0) {
      setCachedImages(query, images)
    }

    recordSuccess('openverse')
    return { docs: [], images }
  },
}

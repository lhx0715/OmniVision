/**
 * Serper.dev 适配器（Google SERP + Images，免费额度最高）
 *
 * 并行调用两个端点：
 *  - /search：文本搜索结果（标题+链接+摘要+知识图谱）
 *  - /images：Google Images 图片结果（供影像档案 Gallery）
 *
 * 共享 SERPER_API_KEY 与 2500 次/月配额；单次搜索消耗 2 次配额（文本+图片），
 * 即约 1250 次搜索/月。两端点独立容错：图片失败不影响文本召回，反之亦然。
 *
 * 注册：https://serper.dev（注册即送 2500 次免费额度，无需信用卡）
 * 配置：SERPER_API_KEY
 */
import type { SourceAdapter, AdapterSearchResult, RawDoc, SearchOpts } from './types.js'
import { fetchWithTimeout, isAbortError } from '../httpUtils.js'
import { markRateLimited, parseRetryAfter, recordSuccess } from '../quotaGuard.js'

interface SerperOrganicResult {
  title?: string
  link?: string
  snippet?: string
  position?: number
  date?: string
}

interface SerperKnowledgeGraph {
  title?: string
  description?: string
  website?: string
}

interface SerperSearchResponse {
  organic?: SerperOrganicResult[]
  knowledgeGraph?: SerperKnowledgeGraph
}

interface SerperImageResult {
  title?: string
  imageUrl?: string
  thumbnailUrl?: string
  imageWidth?: number
  imageHeight?: number
  source?: string
  domain?: string
}

interface SerperImagesResponse {
  images?: SerperImageResult[]
}

const SERPER_SEARCH_URL = 'https://google.serper.dev/search'
const SERPER_IMAGES_URL = 'https://google.serper.dev/images'
const DEFAULT_MAX = 8
const DEFAULT_IMAGE_MAX = 8

interface EndpointResult {
  ok: boolean
  status: number
  data?: unknown
}

/** 调用 Serper 单个端点，统一处理超时/限流/解析 */
async function callSerper(
  url: string,
  body: Record<string, unknown>,
  apiKey: string,
  label: string,
): Promise<EndpointResult> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      15000,
    )
  } catch (err) {
    console.warn(
      `[sources] Serper ${label}${isAbortError(err) ? '超时' : '失败'}:`,
      (err as Error).message,
    )
    return { ok: false, status: 0 }
  }
  if (!res.ok) {
    // 429 限流 / 432 配额耗尽：触发熔断（账户级，两端点共享配额）
    if (res.status === 429 || res.status === 432) {
      const retryAfter = parseRetryAfter(res)
      markRateLimited('serper', retryAfter, `HTTP ${res.status}`)
    } else {
      console.warn(`[sources] Serper ${label}失败: HTTP ${res.status}`)
    }
    return { ok: false, status: res.status }
  }
  let data: unknown
  try {
    data = await res.json()
  } catch (err) {
    console.warn(`[sources] Serper ${label}响应解析失败:`, (err as Error).message)
    return { ok: false, status: res.status }
  }
  return { ok: true, status: res.status, data }
}

/** 解析文本搜索结果为 RawDoc[] */
function parseSearchDocs(data: unknown, maxResults: number): RawDoc[] {
  const d = data as SerperSearchResponse
  const docs: RawDoc[] = []
  // 知识图谱作为首条高置信结果（若有）
  if (d.knowledgeGraph?.title && d.knowledgeGraph?.description) {
    docs.push({
      title: d.knowledgeGraph.title,
      url: d.knowledgeGraph.website ?? '',
      content: d.knowledgeGraph.description,
      source: 'serper',
      rank: 0,
      meta: { knowledgeGraph: true },
    })
  }
  const organic = d.organic ?? []
  const kgOffset = docs.length > 0 ? 1 : 0
  for (let i = 0; i < organic.length && docs.length < maxResults; i++) {
    const r = organic[i]
    if (!r.link || !r.title) continue
    docs.push({
      title: r.title,
      url: r.link,
      content: r.snippet ?? '',
      publishedAt: r.date,
      source: 'serper',
      rank: i + kgOffset,
      meta: r.position ? { position: r.position } : undefined,
    })
  }
  return docs
}

/** 解析图片搜索结果，返回可直接用于 <img> 的图片 URL 数组 */
function parseImages(data: unknown, max: number): string[] {
  const d = data as SerperImagesResponse
  const images: string[] = []
  for (const r of d.images ?? []) {
    const url = r.imageUrl
    if (url && !images.includes(url)) images.push(url)
    if (images.length >= max) break
  }
  return images
}

export const serperAdapter: SourceAdapter = {
  name: 'serper',

  supports(): boolean {
    // 通用 Google SERP 源，所有实体类型/维度均适用
    return true
  },

  async search(query: string, opts: SearchOpts): Promise<AdapterSearchResult> {
    const apiKey = process.env.SERPER_API_KEY ?? ''
    if (!apiKey) return { docs: [] }

    const maxResults = opts.maxResults ?? DEFAULT_MAX
    const searchBody: Record<string, unknown> = {
      q: query,
      num: maxResults,
      gl: 'cn', // 地区：中国（可按需调整）
      hl: 'zh-cn', // 语言：简体中文
    }
    const imagesBody: Record<string, unknown> = {
      q: query,
      num: DEFAULT_IMAGE_MAX,
    }

    // 并行：文本搜索 + 图片搜索（独立容错，互不阻塞）
    const [textRes, imagesRes] = await Promise.all([
      callSerper(SERPER_SEARCH_URL, searchBody, apiKey, '搜索'),
      callSerper(SERPER_IMAGES_URL, imagesBody, apiKey, '图片'),
    ])

    const docs = textRes.ok && textRes.data ? parseSearchDocs(textRes.data, maxResults) : []
    const images =
      imagesRes.ok && imagesRes.data ? parseImages(imagesRes.data, DEFAULT_IMAGE_MAX) : []

    // 任一端点成功即视为该源可用（重置熔断计数）
    // 429 场景两端点都会失败并由 callSerper 触发熔断，此处不会误重置
    if (textRes.ok || imagesRes.ok) {
      recordSuccess('serper')
    }

    return { docs, images }
  },
}

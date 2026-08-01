import type { EntityType } from '@shared/types.js'
import type {
  SourceAdapter,
  SourceName,
  Dimension,
  SearchOpts,
  RecallResult,
  RawDoc,
} from './types.js'
import { tavilyAdapter } from './tavilyAdapter.js'
import { exaAdapter } from './exaAdapter.js'
import { githubAdapter } from './githubAdapter.js'
import { searxngAdapter } from './searxngAdapter.js'
import { serperAdapter } from './serperAdapter.js'
import { duckduckgoAdapter } from './duckduckgoAdapter.js'
import { dedupe, normalizeUrl } from '../fusion/dedupe.js'
import { rrfFuse, DEFAULT_SOURCE_WEIGHTS } from '../fusion/rrf.js'
import { makeCacheKey, getCached, setCache, cleanExpired } from '../searchCache.js'
import { isAvailable as isCircuitAvailable } from '../quotaGuard.js'

/**
 * 适配器顺序决定 RRF 融合与去重的优先级（先出现者保留）。
 * 大会场景策略：免费额度多的源靠前，额度少的靠后——
 * 当额度少的源被熔断时，流量自然由免费源承接，保证零成本兜底。
 *  - searxng：自建，无限免费（主力）
 *  - serper：2500 次/月免费（Google 结果，次主力）
 *  - tavily：1000 次/月（唯一返回 images 的源，供影像档案 Gallery）
 *  - exa：1000 次/月（语义搜索，verdict/timeline 等维度增强）
 *  - duckduckgo：完全免费（兜底，Instant Answer）
 *  - github：ITEM 类热度/趋势维度专用
 */
const ALL_ADAPTERS: SourceAdapter[] = [
  searxngAdapter,
  serperAdapter,
  tavilyAdapter,
  exaAdapter,
  duckduckgoAdapter,
  githubAdapter,
]

function isConfigured(name: SourceName): boolean {
  switch (name) {
    case 'searxng':
      return !!process.env.SEARXNG_URL
    case 'serper':
      return !!process.env.SERPER_API_KEY
    case 'tavily':
      return !!process.env.TAVILY_API_KEY
    case 'exa':
      return !!process.env.EXA_API_KEY
    case 'duckduckgo':
      return true // 完全免费，无需 key
    case 'openverse':
      return true // 免费图片源，无需 key
    case 'github':
      return true
    default:
      return false
  }
}

export function getActiveAdapters(
  entityType: EntityType,
  dimension?: Dimension,
): SourceAdapter[] {
  const active = ALL_ADAPTERS.filter(
    (a) => isConfigured(a.name) && (dimension ? a.supports(entityType, dimension) : true),
  )
  if (active.length === 0) {
    // 全部未配置时，降级到完全免费的 DuckDuckGo（无需 key），保证召回不归零
    console.warn('[sources] 无可用适配器，降级为 duckduckgo-only')
    return [duckduckgoAdapter]
  }
  return active
}

export async function searchAll(
  query: string,
  opts: SearchOpts,
  adapters: SourceAdapter[],
): Promise<RecallResult> {
  await cleanExpired()

  const settled = await Promise.allSettled(
    adapters.map(async (a) => {
      const cacheKey = makeCacheKey(query, a.name, opts)
      const cached = await getCached(cacheKey)
      if (cached) {
        // 缓存命中不消耗 API 配额，无需检查熔断状态
        console.log(`[sources] ${a.name} 缓存命中: ${query.slice(0, 30)}`)
        return cached
      }
      // 真实调用前检查熔断：被限流的源在冷却期内直接跳过，流量落到其他源
      if (!isCircuitAvailable(a.name)) {
        console.log(`[sources] ${a.name} 熔断中，跳过本次调用`)
        return { docs: [], images: [] }
      }
      const result = await a.search(query, opts)
      await setCache(cacheKey, query, a.name, opts.dimension, result)
      return result
    }),
  )

  const perSource: { source: SourceName; docs: RawDoc[] }[] = []
  const bySource: Record<string, number> = {}
  const images: string[] = []
  let answer: string | undefined

  settled.forEach((s, i) => {
    const name = adapters[i].name
    if (s.status === 'fulfilled') {
      perSource.push({ source: name, docs: s.value.docs })
      bySource[name] = s.value.docs.length
      if (s.value.images && s.value.images.length > 0) {
        for (const img of s.value.images) {
          if (!images.includes(img)) images.push(img)
        }
      }
      if (s.value.answer && !answer) answer = s.value.answer
    } else {
      console.warn(`[sources] ${name} 召回失败:`, (s.reason as Error)?.message)
      perSource.push({ source: name, docs: [] })
      bySource[name] = 0
    }
  })

  const fused = rrfFuse(perSource)
  const { docs, sourceMap } = dedupe(fused)

  for (const d of docs) {
    const sources = sourceMap.get(normalizeUrl(d.url))
    if (sources && sources.length > 1) {
      d.meta = { ...(d.meta ?? {}), crossSources: sources }
    }
  }

  return { docs, bySource, images, answer, perSource }
}

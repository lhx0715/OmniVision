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
import { dedupe, normalizeUrl } from '../fusion/dedupe.js'
import { rrfFuse, DEFAULT_SOURCE_WEIGHTS } from '../fusion/rrf.js'
import { makeCacheKey, getCached, setCache, cleanExpired } from '../searchCache.js'

const ALL_ADAPTERS: SourceAdapter[] = [tavilyAdapter, exaAdapter, githubAdapter]

function isAvailable(name: SourceName): boolean {
  switch (name) {
    case 'tavily':
      return !!process.env.TAVILY_API_KEY
    case 'exa':
      return !!process.env.EXA_API_KEY
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
    (a) => isAvailable(a.name) && (dimension ? a.supports(entityType, dimension) : true),
  )
  if (active.length === 0) {
    console.warn('[sources] 无可用适配器，降级为 tavily-only')
    return [tavilyAdapter]
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
        console.log(`[sources] ${a.name} 缓存命中: ${query.slice(0, 30)}`)
        return cached
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

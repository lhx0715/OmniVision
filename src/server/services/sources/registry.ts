/**
 * 适配器注册表 + 多源并行召回（PRD-01 FR-01/FR-03）
 *
 * - getActiveAdapters：按 env key 探测 + supports() 过滤，无 key 自动跳过
 * - searchAll：并发调用各适配器（Promise.allSettled，单源失败不阻塞），
 *   收集 perSource ranked list + images，再 RRF 融合 + 去重
 */
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

/** 该源是否有可用凭证（github 匿名可用） */
function isAvailable(name: SourceName): boolean {
  switch (name) {
    case 'tavily':
      return !!process.env.TAVILY_API_KEY
    case 'exa':
      return !!process.env.EXA_API_KEY
    case 'github':
      return true // 匿名调用，10次/分
    default:
      return false
  }
}

/**
 * 取当前可用的适配器集合（按实体类型/维度过滤）。
 * 若全部不可用，返回 [tavilyAdapter]（search() 内部再降级为空，保底不崩）。
 */
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

/**
 * 多源并行召回 + RRF 融合 + 去重。
 * 单源失败（网络/限流/解析）不阻塞，仅该源 docs 为空。
 */
export async function searchAll(
  query: string,
  opts: SearchOpts,
  adapters: SourceAdapter[],
): Promise<RecallResult> {
  // 懒清理过期缓存（进程首次调用时执行一次，后续不再清理）
  cleanExpired()

  // 缓存层：每个适配器调用前先查 24h 缓存，命中则跳过真实 API 调用
  const settled = await Promise.allSettled(
    adapters.map(async (a) => {
      const cacheKey = makeCacheKey(query, a.name, opts)
      const cached = getCached(cacheKey)
      if (cached) {
        console.log(`[sources] ${a.name} 缓存命中: ${query.slice(0, 30)}`)
        return cached
      }
      const result = await a.search(query, opts)
      setCache(cacheKey, query, a.name, opts.dimension, result)
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

  // RRF 融合（跨源 URL 重复自动合并得分）
  const fused = rrfFuse(perSource)
  // 去重（标题近重复合并，RRF 已处理 URL 重复，此处主要兜底）
  const { docs, sourceMap } = dedupe(fused)

  // 把跨源印证信息回填到 doc.meta.crossSources（供 M2 置信度用）
  for (const d of docs) {
    const sources = sourceMap.get(normalizeUrl(d.url))
    if (sources && sources.length > 1) {
      d.meta = { ...(d.meta ?? {}), crossSources: sources }
    }
  }

  return { docs, bySource, images, answer, perSource }
}

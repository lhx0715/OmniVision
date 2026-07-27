import crypto from 'crypto'
import { prisma } from '../db.js'
import type { AdapterSearchResult, SearchOpts, SourceName } from './sources/types.js'

const TTL_HOURS = 24

let lazyCleaned = false

export function makeCacheKey(
  query: string,
  source: SourceName,
  opts: SearchOpts,
): string {
  const parts = [
    `q=${query}`,
    `s=${source}`,
    `m=${opts.maxResults ?? ''}`,
    `d=${opts.dimension ?? ''}`,
    `inc=${(opts.includeDomains ?? []).slice().sort().join(',')}`,
    `exc=${(opts.excludeDomains ?? []).slice().sort().join(',')}`,
  ]
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex')
}

export async function getCached(cacheKey: string): Promise<AdapterSearchResult | null> {
  try {
    const row = await prisma.searchCache.findUnique({
      where: { cacheKey },
    })

    if (!row) return null

    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - TTL_HOURS)
    if (row.createdAt < cutoff) return null

    const docs = JSON.parse(row.docsJson) as AdapterSearchResult['docs']
    const images = row.imagesJson ? (JSON.parse(row.imagesJson) as string[]) : undefined
    const answer = row.answer ?? undefined

    return { docs, images, answer }
  } catch (err) {
    console.warn('[searchCache] 读取缓存失败，降级为真实搜索:', (err as Error).message)
    return null
  }
}

export async function setCache(
  cacheKey: string,
  query: string,
  source: SourceName,
  dimension: SearchOpts['dimension'],
  result: AdapterSearchResult,
): Promise<void> {
  try {
    await prisma.searchCache.upsert({
      where: { cacheKey },
      update: {
        query,
        source,
        dimension,
        docsJson: JSON.stringify(result.docs),
        imagesJson: result.images ? JSON.stringify(result.images) : null,
        answer: result.answer ?? null,
        createdAt: new Date(),
      },
      create: {
        cacheKey,
        query,
        source,
        dimension,
        docsJson: JSON.stringify(result.docs),
        imagesJson: result.images ? JSON.stringify(result.images) : null,
        answer: result.answer ?? null,
      },
    })
  } catch (err) {
    console.warn('[searchCache] 写入缓存失败，不影响搜索:', (err as Error).message)
  }
}

export async function cleanExpired(): Promise<void> {
  if (lazyCleaned) return
  lazyCleaned = true
  try {
    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - TTL_HOURS)
    const result = await prisma.searchCache.deleteMany({
      where: { createdAt: { lte: cutoff } },
    })
    if (result.count > 0) {
      console.log(`[searchCache] 清理 ${result.count} 条过期记录`)
    }
  } catch (err) {
    console.warn('[searchCache] 清理过期记录失败:', (err as Error).message)
  }
}

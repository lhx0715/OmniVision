/**
 * 搜索结果缓存层（24h TTL）
 *
 * 在适配器调用前查缓存，命中则直接返回历史结果，避免重复消耗 Tavily/Exa 配额。
 * 缓存粒度：(query + source + maxResults + includeDomains + excludeDomains + dimension)
 *
 * 设计要点：
 * - 复用 api/db.ts 的 better-sqlite3 单例（同步 API，零等待）
 * - 缓存读写失败不阻塞主流程（try/catch 兜底，失败降级为真实搜索）
 * - TTL 24h：用 SQLite 的 datetime('now', '-1 day') 过滤过期记录
 * - 首次调用时清理一次过期记录（懒清理，避免 cron 依赖）
 */
import crypto from 'crypto'
import { getDb } from '../db.js'
import type { AdapterSearchResult, SearchOpts, SourceName } from './sources/types.js'

const TTL_HOURS = 24

/** 是否已执行过首次懒清理（进程级标记，避免每次调用都清理） */
let lazyCleaned = false

/**
 * 生成缓存 key：sha256(所有影响结果的字段)
 * 字段顺序固定，保证相同入参 → 相同 key。
 */
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

/**
 * 读取缓存。命中且未过期则返回反序列化结果，否则返回 null。
 * 任何异常（DB 未就绪、JSON 损坏）都降级为 null，不阻塞搜索。
 */
export function getCached(cacheKey: string): AdapterSearchResult | null {
  try {
    const db = getDb()
    const row = db
      .prepare(
        `SELECT docs_json, images_json, answer FROM search_cache
         WHERE cache_key = ? AND created_at > datetime('now', ?)`,
      )
      .get(cacheKey, `-${TTL_HOURS} hours`) as
      | { docs_json: string; images_json: string | null; answer: string | null }
      | undefined

    if (!row) return null

    const docs = JSON.parse(row.docs_json) as AdapterSearchResult['docs']
    const images = row.images_json ? (JSON.parse(row.images_json) as string[]) : undefined
    const answer = row.answer ?? undefined

    return { docs, images, answer }
  } catch (err) {
    console.warn('[searchCache] 读取缓存失败，降级为真实搜索:', (err as Error).message)
    return null
  }
}

/**
 * 写入缓存。INSERT OR REPLACE 保证相同 key 覆盖旧记录。
 * 写入失败仅告警，不影响已返回的搜索结果。
 */
export function setCache(
  cacheKey: string,
  query: string,
  source: SourceName,
  dimension: SearchOpts['dimension'],
  result: AdapterSearchResult,
): void {
  try {
    const db = getDb()
    db.prepare(
      `INSERT OR REPLACE INTO search_cache
       (cache_key, query, source, dimension, docs_json, images_json, answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      cacheKey,
      query,
      source,
      dimension ?? null,
      JSON.stringify(result.docs),
      result.images ? JSON.stringify(result.images) : null,
      result.answer ?? null,
    )
  } catch (err) {
    console.warn('[searchCache] 写入缓存失败，不影响搜索:', (err as Error).message)
  }
}

/**
 * 清理过期缓存记录（24h 前）。
 * 进程首次调用时执行一次，后续不再清理（懒清理策略，避免每次调用都 DELETE）。
 */
export function cleanExpired(): void {
  if (lazyCleaned) return
  lazyCleaned = true
  try {
    const db = getDb()
    const result = db
      .prepare(
        `DELETE FROM search_cache WHERE created_at <= datetime('now', ?)`,
      )
      .run(`-${TTL_HOURS} hours`)
    if (result.changes > 0) {
      console.log(`[searchCache] 清理 ${result.changes} 条过期记录`)
    }
  } catch (err) {
    console.warn('[searchCache] 清理过期记录失败:', (err as Error).message)
  }
}

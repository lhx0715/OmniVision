/**
 * 全链路结果缓存（PRD: 承载能力优化）
 *
 * 缓存 ReAct Agent 最终生成的情报卡片 + 数据源 + 图片 + 信源统计。
 * 与 searchCache（仅缓存单源搜索结果）互补：本缓存命中后，一次搜索
 * 0 次 LLM 调用、0 次外部搜索 API，仅 1 次数据库读取即可完成整条 SSE 推送。
 *
 * 命中场景：比赛评委/多用户搜索同一批热词 → 第二次起瞬时返回。
 *
 * key = sha256(query + entityType + 风控 domain 白/黑名单)
 *   - 同一查询在不同风控策略（如政治敏感强制权威白名单）下结果不同，
 *     故 domain 配置纳入 key，避免串味。
 * TTL = 24h（与 searchCache 一致），过期后降级为实时生成。
 */
import crypto from 'crypto'
import { prisma } from '../db.js'
import type { EntityType, IntelCard, IntelSource, SourceStats } from '@shared/types.js'

const TTL_HOURS = 24

/** 缓存的完整研究结果（与 search.ts 推送结构一致） */
export interface CachedIntelResult {
  cards: IntelCard[]
  sources: IntelSource[]
  images: string[]
  sourceStats: SourceStats | null
}

/**
 * 生成最终卡片缓存 key。
 * @param intent 风控层传入的 domain 白/黑名单（Class B 强制权威源时与普通查询结果不同）
 */
export function makeFinalCacheKey(
  query: string,
  entityType: EntityType,
  intent: { includeDomains?: string[]; excludeDomains?: string[] },
): string {
  const parts = [
    `q=${query}`,
    `t=${entityType}`,
    `inc=${(intent.includeDomains ?? []).slice().sort().join(',')}`,
    `exc=${(intent.excludeDomains ?? []).slice().sort().join(',')}`,
  ]
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex')
}

/**
 * 读取最终卡片缓存。
 * @param allowExpired 兜底场景（LLM/搜索全失败时）允许读取过期缓存，保证有内容可推
 */
export async function getFinalCached(
  cacheKey: string,
  allowExpired = false,
): Promise<CachedIntelResult | null> {
  try {
    const row = await prisma.finalCardCache.findUnique({ where: { cacheKey } })
    if (!row) return null

    if (!allowExpired) {
      const cutoff = new Date()
      cutoff.setHours(cutoff.getHours() - TTL_HOURS)
      if (row.createdAt < cutoff) return null
    }

    return {
      cards: JSON.parse(row.cardsJson) as IntelCard[],
      sources: JSON.parse(row.sourcesJson) as IntelSource[],
      images: JSON.parse(row.imagesJson) as string[],
      sourceStats: row.sourceStatsJson
        ? (JSON.parse(row.sourceStatsJson) as SourceStats)
        : null,
    }
  } catch (err) {
    console.warn('[finalCardCache] 读取失败，降级实时生成:', (err as Error).message)
    return null
  }
}

/**
 * 写入最终卡片缓存。失败不影响主流程（仅记录日志）。
 */
export async function setFinalCache(
  cacheKey: string,
  query: string,
  entityType: EntityType,
  result: CachedIntelResult,
): Promise<void> {
  try {
    await prisma.finalCardCache.upsert({
      where: { cacheKey },
      update: {
        query,
        entityType,
        cardsJson: JSON.stringify(result.cards),
        sourcesJson: JSON.stringify(result.sources),
        imagesJson: JSON.stringify(result.images),
        sourceStatsJson: result.sourceStats ? JSON.stringify(result.sourceStats) : null,
        createdAt: new Date(),
      },
      create: {
        cacheKey,
        query,
        entityType,
        cardsJson: JSON.stringify(result.cards),
        sourcesJson: JSON.stringify(result.sources),
        imagesJson: JSON.stringify(result.images),
        sourceStatsJson: result.sourceStats ? JSON.stringify(result.sourceStats) : null,
      },
    })
  } catch (err) {
    console.warn('[finalCardCache] 写入失败，不影响搜索:', (err as Error).message)
  }
}

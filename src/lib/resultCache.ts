/**
 * 前端结果快照缓存（会话级 · 内存）
 *
 * 与 localStorage 档案库（仅存元数据）+ 后端 FinalCardCache（服务端 24h TTL）互补，
 * 构成三级缓存层次：
 *  1. localStorage 档案库 — 仅元数据，跨刷新存活
 *  2. 本快照缓存（本文件）— 完整结果（cards/sources/images/sourceStats），会话级内存
 *  3. 后端 FinalCardCache — 服务端 24h，前端未命中时由后端快速返回
 *
 * 命中场景：用户在档案库 / 历史面包屑中点击"曾经搜索过"的条目，若本会话已搜索过
 * 相同 query+entityType，直接恢复完整结果，跳过 SSE 重新搜索与加载动画，实现瞬时回看。
 */
import type {
  CardType,
  CardData,
  EntityType,
  IntelSource,
  SourceStats,
} from '@/types';

export interface ResultSnapshot {
  query: string;
  entityType: EntityType | null;
  engineMode: 'live' | 'mock' | null;
  cards: Partial<Record<CardType, CardData>>;
  sources: IntelSource[];
  images: string[];
  sourceStats: SourceStats | null;
  savedAt: number;
}

const MAX_ENTRIES = 20;

/** 会话级内存缓存：key = `${query}::${entityType ?? 'null'}` */
const cache = new Map<string, ResultSnapshot>();

function makeKey(query: string, entityType: EntityType | null): string {
  return `${query}::${entityType ?? 'null'}`;
}

/**
 * 保存一次完整搜索结果快照。
 * 相同 query+entityType 覆盖旧值并提至最近（删除后重插，刷新 Map 迭代顺序）；
 * 超容量时淘汰最旧条目（Map 按插入顺序，首个即最旧）。
 */
export function saveResultSnapshot(
  snapshot: Omit<ResultSnapshot, 'savedAt'>,
): void {
  const key = makeKey(snapshot.query, snapshot.entityType);
  cache.delete(key);
  cache.set(key, { ...snapshot, savedAt: Date.now() });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** 读取结果快照；未命中返回 null */
export function getResultSnapshot(
  query: string,
  entityType: EntityType | null,
): ResultSnapshot | null {
  return cache.get(makeKey(query, entityType)) ?? null;
}

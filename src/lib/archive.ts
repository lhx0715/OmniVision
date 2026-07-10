import type { EntityType } from '@/types';

export interface ArchiveEntry {
  query: string;
  entityType: EntityType | null;
  engineMode: 'live' | 'mock';
  timestamp: number;
}

const STORAGE_KEY = 'omnivision_archive';
const MAX_ENTRIES = 50;

/** 从 localStorage 加载档案列表 */
export function loadArchive(): ArchiveEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ArchiveEntry =>
        e &&
        typeof e.query === 'string' &&
        typeof e.timestamp === 'number' &&
        (e.engineMode === 'live' || e.engineMode === 'mock') &&
        (e.entityType === null || e.entityType === 'HUMAN' || e.entityType === 'EVENT' || e.entityType === 'ITEM'),
    );
  } catch {
    return [];
  }
}

/** 写入档案条目：去重（相同 query 只保留最新），超过 MAX_ENTRIES 删除最旧 */
export function saveArchiveEntry(entry: ArchiveEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const list = loadArchive();
    // 去重：移除相同 query 的旧条目
    const filtered = list.filter((e) => e.query !== entry.query);
    // 新条目置于顶部（最新在前）
    const next = [entry, ...filtered];
    // 限制最大数量
    const trimmed = next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage 写入失败（隐私模式 / 配额已满）— 静默忽略
  }
}

/** 清空全部档案 */
export function clearArchive(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默忽略
  }
}

/** 将时间戳格式化为相对时间字符串 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 60) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  if (hour < 24) return `${hour}小时前`;
  if (day < 30) return `${day}天前`;
  // 超过 30 天显示日期
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

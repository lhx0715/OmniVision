import { useEffect, useState } from 'react';
import { Archive, X, Trash2, Clock, ChevronRight, FileText } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import { cn } from '@/lib/utils';
import {
  loadArchive,
  clearArchive,
  formatRelativeTime,
  type ArchiveEntry,
} from '@/lib/archive';
import type { EntityType } from '@/types';

interface ArchiveDrawerProps {
  /** 选中条目后触发新搜索 */
  onSelect: (query: string, entityType: EntityType | null) => void;
}

const ENTITY_TAG: Record<EntityType, { label: string; cls: string }> = {
  HUMAN: { label: '人物', cls: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' },
  EVENT: { label: '事件', cls: 'border-sky-500/30 text-sky-400 bg-sky-500/5' },
  ITEM: { label: '事物', cls: 'border-amber-500/30 text-amber-400 bg-amber-500/5' },
};

export default function ArchiveDrawer({ onSelect }: ArchiveDrawerProps) {
  const archiveOpen = useOmniVisionStore((s) => s.archiveOpen);
  const setArchiveOpen = useOmniVisionStore((s) => s.setArchiveOpen);

  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [confirming, setConfirming] = useState(false);

  // 抽屉打开时重新读取档案
  useEffect(() => {
    if (archiveOpen) {
      setEntries(loadArchive());
      setConfirming(false);
    }
  }, [archiveOpen]);

  // ESC 关闭
  useEffect(() => {
    if (!archiveOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArchiveOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [archiveOpen, setArchiveOpen]);

  const handleSelect = (entry: ArchiveEntry) => {
    onSelect(entry.query, entry.entityType);
    setArchiveOpen(false);
  };

  const handleClear = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    clearArchive();
    setEntries([]);
    setConfirming(false);
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={() => setArchiveOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-zinc-950/70 backdrop-blur-sm transition-opacity duration-300',
          archiveOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden={!archiveOpen}
      />

      {/* 抽屉主体 — 从右侧滑入 */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[360px] max-w-[90vw] flex flex-col',
          'bg-zinc-950/95 backdrop-blur-xl border-l border-emerald-500/15',
          'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          archiveOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="情报档案库"
      >
        {/* 角标括号装饰 */}
        <span className="corner-brackets absolute inset-0 pointer-events-none" />

        {/* 顶部标题栏 */}
        <div className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <Archive className="h-4 w-4 text-emerald-400" />
            <h2 className="font-mono text-sm tracking-[0.25em] text-zinc-200 uppercase">
              情报档案库
            </h2>
            <span className="text-[10px] font-mono text-zinc-600">
              · {entries.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setArchiveOpen(false)}
            aria-label="关闭"
            title="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/5 text-zinc-500 transition-colors hover:text-zinc-200 hover:border-white/15"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 档案列表 */}
        <div className="relative z-10 flex-1 overflow-y-auto px-3 py-3">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <FileText className="h-10 w-10 text-zinc-700" strokeWidth={1.2} />
              <p className="text-sm text-zinc-600 font-mono tracking-wider">
                暂无历史档案
              </p>
              <p className="text-[10px] text-zinc-700 font-mono">
                完成一次搜索后将自动归档
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((entry, i) => {
                const entityTag = entry.entityType ? ENTITY_TAG[entry.entityType] : null;
                return (
                  <li key={`${entry.query}-${entry.timestamp}-${i}`}>
                    <button
                      type="button"
                      onClick={() => handleSelect(entry)}
                      title={`回看：${entry.query}`}
                      className={cn(
                        'group w-full text-left rounded-lg border border-white/[0.05] bg-white/[0.015]',
                        'px-3.5 py-3 transition-all duration-200',
                        'hover:border-emerald-500/40 hover:bg-emerald-500/[0.04] hover:translate-x-[-2px]',
                      )}
                    >
                      {/* 查询目标 — 大字 */}
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-[10px] text-emerald-500/50 tabular-nums mt-1 shrink-0">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold text-zinc-100 truncate font-sans leading-tight">
                            {entry.query}
                          </p>
                          {/* 标签条 */}
                          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            {/* 引擎模式 */}
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] font-mono tracking-wider uppercase',
                                entry.engineMode === 'live'
                                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
                                  : 'border-amber-500/30 text-amber-400 bg-amber-500/5',
                              )}
                            >
                              <span
                                className={cn(
                                  'h-1 w-1 rounded-full',
                                  entry.engineMode === 'live' ? 'bg-emerald-400' : 'bg-amber-400',
                                )}
                              />
                              {entry.engineMode === 'live' ? 'LIVE' : 'MOCK'}
                            </span>
                            {/* 实体类型 */}
                            {entityTag && (
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] font-mono tracking-wider uppercase',
                                  entityTag.cls,
                                )}
                              >
                                {entityTag.label}
                              </span>
                            )}
                            {/* 时间 */}
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-zinc-600 ml-auto">
                              <Clock className="h-2.5 w-2.5" />
                              {formatRelativeTime(entry.timestamp)}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-700 shrink-0 mt-1 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 底部清空栏 */}
        {entries.length > 0 && (
          <div className="relative z-10 px-5 py-4 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={handleClear}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-mono tracking-wider uppercase transition-all',
                confirming
                  ? 'border-rose-500/50 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20'
                  : 'border-white/10 text-zinc-500 hover:text-zinc-200 hover:border-white/20',
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirming ? '确认清空全部档案？' : '清空档案'}
            </button>
            {confirming && (
              <p className="mt-1.5 text-center text-[9px] font-mono text-zinc-600">
                再次点击确认 · 点击空白处取消
              </p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

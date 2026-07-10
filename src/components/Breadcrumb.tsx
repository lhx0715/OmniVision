import { History } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import { cn } from '@/lib/utils';
import type { EntityType } from '@/types';

interface BreadcrumbProps {
  /** 点击历史条目后触发新搜索 */
  onNavigate: (query: string, entityType: EntityType | null) => void;
}

const ENTITY_TAG: Record<EntityType, string> = {
  HUMAN: '人',
  EVENT: '事',
  ITEM: '物',
};

export default function Breadcrumb({ onNavigate }: BreadcrumbProps) {
  const history = useOmniVisionStore((s) => s.history);
  const popHistoryTo = useOmniVisionStore((s) => s.popHistoryTo);

  if (history.length <= 1) return null;

  const handleClick = (index: number) => {
    const isCurrent = index === history.length - 1;
    if (isCurrent) return;
    const entry = popHistoryTo(index);
    if (entry) onNavigate(entry.query, entry.entityType);
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-500/15 bg-zinc-900/30 px-3 py-1.5 animate-fade-in">
      <History className="h-3 w-3 shrink-0 text-emerald-500/70" />
      <span className="shrink-0 text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600">
        Trail
      </span>
      <span className="shrink-0 text-zinc-700">·</span>
      <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none">
        {history.map((entry, i) => {
          const isCurrent = i === history.length - 1;
          return (
            <div key={`${entry.query}-${entry.timestamp}`} className="flex items-center gap-1.5 shrink-0">
              {i > 0 && (
                <span className="text-emerald-500/40 select-none" aria-hidden>
                  ›
                </span>
              )}
              <button
                type="button"
                onClick={() => handleClick(i)}
                disabled={isCurrent}
                title={isCurrent ? '当前档案' : `回溯至：${entry.query}`}
                className={cn(
                  'group inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors',
                  isCurrent
                    ? 'text-emerald-400 cursor-default'
                    : 'text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer',
                )}
              >
                {entry.entityType && (
                  <span
                    className={cn(
                      'rounded-sm border px-1 text-[8px] leading-none py-0.5',
                      isCurrent
                        ? 'border-emerald-500/40 text-emerald-400'
                        : 'border-zinc-700 text-zinc-500 group-hover:border-emerald-500/40 group-hover:text-emerald-300',
                    )}
                  >
                    {ENTITY_TAG[entry.entityType]}
                  </span>
                )}
                <span className="max-w-[160px] truncate">{entry.query}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

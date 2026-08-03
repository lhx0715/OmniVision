import { useState, type FormEvent, useEffect } from 'react';
import { Search, ArrowRight, Terminal } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import { cn } from '@/lib/utils';
import type { EntityType } from '@/types';

const ENTITY_LABELS: Record<EntityType, string> = {
  HUMAN: '人物',
  EVENT: '事件',
  ITEM: '事物',
};

interface SearchBarProps {
  active: boolean;
  onSubmit: (query: string) => void;
}

export default function SearchBar({ active, onSubmit }: SearchBarProps) {
  const storedQuery = useOmniVisionStore((s) => s.query);
  const [value, setValue] = useState(storedQuery);
  const entityType = useOmniVisionStore((s) => s.entityType);

  useEffect(() => {
    setValue(storedQuery);
  }, [storedQuery]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    onSubmit(q);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'w-full transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        active ? 'max-w-none' : 'max-w-3xl',
      )}
    >
      <div
        className={cn(
          'dossier-card corner-brackets animate-breathe rounded-2xl flex items-center gap-3 px-4 py-3 relative',
          active && 'scale-[0.97] origin-top',
        )}
      >
        {/* 左侧战术标识 */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="pulse-dot emerald inline-block h-2 w-2 rounded-full bg-emerald-400" />
          {active ? (
            <Terminal className="h-4 w-4 text-cyan-400" />
          ) : (
            <Search className="h-4 w-4 text-emerald-400" />
          )}
        </div>

        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={active ? '继续侦察...' : '输入任意人、事、物，快速获取全景情报...'}
          className="flex-1 bg-transparent outline-none text-zinc-100 placeholder:text-zinc-500 font-sans text-base"
          aria-label="搜索查询"
          autoFocus={!active}
        />

        {/* 实体类型标签 */}
        {entityType && (
          <span className="hidden sm:inline-flex items-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] text-cyan-300 font-mono tracking-wider uppercase">
            {ENTITY_LABELS[entityType]}
          </span>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          aria-label="提交搜索"
          className="shrink-0 grid place-items-center h-9 w-9 rounded-xl bg-emerald-500/90 text-zinc-950 hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!value.trim()}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

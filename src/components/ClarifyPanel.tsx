import { Compass } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import { cn } from '@/lib/utils';
import type { ClarifyOption, EntityType } from '@/types';

const ENTITY_TAG: Record<EntityType, { label: string; cls: string; dot: string }> = {
  HUMAN: { label: '人物', cls: 'border-emerald-500/25 text-emerald-300 bg-emerald-500/5', dot: 'bg-emerald-400' },
  EVENT: { label: '事件', cls: 'border-sky-500/25 text-sky-300 bg-sky-500/5', dot: 'bg-sky-400' },
  ITEM: { label: '事物', cls: 'border-amber-500/25 text-amber-300 bg-amber-500/5', dot: 'bg-amber-400' },
};

interface ClarifyPanelProps {
  onPick: (option: ClarifyOption) => void;
}

export default function ClarifyPanel({ onPick }: ClarifyPanelProps) {
  const options = useOmniVisionStore((s) => s.clarifyOptions);

  return (
    <div className="animate-fade-in-up w-full max-w-4xl">
      {/* 头部 */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className="pulse-dot sky inline-block h-2 w-2 rounded-full bg-cyan-400" />
        <Compass className="h-4 w-4 text-cyan-400" />
        <span className="text-[11px] font-mono tracking-[0.25em] text-zinc-400 uppercase">
          意图确认
        </span>
        <span className="text-[10px] font-mono text-zinc-600">· 多义实体检测</span>
        <span className="h-px flex-1 bg-gradient-to-r from-cyan-700/40 to-transparent ml-2" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {options.map((opt, i) => {
          const tag = ENTITY_TAG[opt.entityType];
          return (
            <button
              key={`${opt.label}-${i}`}
              onClick={() => onPick(opt)}
              className={cn(
                'dossier-card corner-brackets group text-left rounded-xl p-4 border border-white/5 relative overflow-hidden',
                'hover:border-cyan-500/30 hover:-translate-y-1 hover:shadow-2xl hover:shadow-cyan-500/5',
                'transition-all duration-300 animate-fade-in-up',
              )}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {/* 背景编号 */}
              <span className="bg-number text-cyan-500" style={{ top: '-0.5rem', right: '0.25rem', fontSize: '4rem' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="relative z-10 flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-zinc-100 font-sans">
                  {opt.label}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-mono',
                    tag.cls,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', tag.dot)} />
                  {tag.label}
                </span>
              </div>
              {opt.description && (
                <p className="relative z-10 mt-2 text-xs text-zinc-400 leading-relaxed">
                  {opt.description}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

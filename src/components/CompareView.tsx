import { Loader2, Swords, Triangle, Hexagon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useOmniVisionStore } from '@/store/omnivision';
import { cn } from '@/lib/utils';
import BentoGrid from './BentoGrid';

/** 极简 markdown 内联渲染：处理 **加粗**，其余原样输出（保留换行） */
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={`b-${key++}`} className="font-bold text-zinc-100">
        {match[1]}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="h-3 w-2/3 rounded bg-white/5 animate-pulse" />
      <div className="h-3 w-full rounded bg-white/5 animate-pulse" />
      <div className="h-3 w-5/6 rounded bg-white/5 animate-pulse" />
      <div className="h-3 w-4/5 rounded bg-white/5 animate-pulse" />
      <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
    </div>
  );
}

interface CompareViewProps {
  onTagClick?: (tag: string) => void;
}

/**
 * C1 双实体对比视图
 * - 上下堆叠两组 BentoGrid（A 在上翠绿，B 在下琥珀）
 * - 中间分隔条流式渲染对比摘要（loading 时显示骨架屏）
 */
export default function CompareView({ onTagClick }: CompareViewProps) {
  const compareQueryA = useOmniVisionStore((s) => s.compareQueryA);
  const compareQueryB = useOmniVisionStore((s) => s.compareQueryB);
  const cardsA = useOmniVisionStore((s) => s.cards);
  const cardsB = useOmniVisionStore((s) => s.cardsB);
  const streamingA = useOmniVisionStore((s) => s.streamingCards);
  const streamingB = useOmniVisionStore((s) => s.streamingCardsB);
  const compareSummary = useOmniVisionStore((s) => s.compareSummary);
  const compareSummaryLoading = useOmniVisionStore((s) => s.compareSummaryLoading);

  const showSummarySkeleton = compareSummaryLoading && !compareSummary;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* ===== 实体 A（翠绿色强调） ===== */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 px-1">
          <Triangle className="h-3.5 w-3.5 text-emerald-400 fill-emerald-400/30" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-400/90">
            Entity-A
          </span>
          <span className="text-zinc-700">·</span>
          <span className="text-xs font-mono text-zinc-300 truncate max-w-[300px]">
            {compareQueryA}
          </span>
        </div>
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.02] p-2.5">
          <BentoGrid
            cardsOverride={cardsA}
            streamingOverride={streamingA}
            accentColor="emerald"
            onTagClick={onTagClick}
          />
        </div>
      </section>

      {/* ===== 对比摘要分隔条（中性色 zinc/cyan） ===== */}
      <div className="relative z-10 overflow-hidden rounded-xl border border-cyan-500/15 bg-zinc-900/40 backdrop-blur-sm animate-fade-in">
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-500/60" />
        <div className="py-3 pl-4 pr-4">
          <div className="mb-2 flex items-center gap-2">
            <Swords className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-400/90">
              Compare Analysis · 对比摘要
            </span>
            {compareSummaryLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
            )}
          </div>

          {showSummarySkeleton ? (
            <SummarySkeleton />
          ) : compareSummary ? (
            <div className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-300 font-sans">
              {renderInline(compareSummary)}
            </div>
          ) : (
            <p className="text-[11px] font-mono text-zinc-600">
              对比摘要不可用
            </p>
          )}
        </div>
      </div>

      {/* ===== 实体 B（琥珀色强调） ===== */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 px-1">
          <Hexagon className="h-3.5 w-3.5 text-amber-400 fill-amber-400/30" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-amber-400/90">
            Entity-B
          </span>
          <span className="text-zinc-700">·</span>
          <span className="text-xs font-mono text-zinc-300 truncate max-w-[300px]">
            {compareQueryB}
          </span>
        </div>
        <div className={cn('rounded-2xl border border-amber-400/25 bg-amber-500/[0.02] p-2.5')}>
          <BentoGrid
            cardsOverride={cardsB}
            streamingOverride={streamingB}
            accentColor="amber"
          />
        </div>
      </section>
    </div>
  );
}

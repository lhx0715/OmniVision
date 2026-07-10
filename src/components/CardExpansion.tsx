import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useOmniVisionStore } from '@/store/omnivision';
import type { CardType } from '@/types';

/** 各卡片类型的强调色（左侧竖线 + 标题文字） */
const ACCENT: Record<CardType, { line: string; text: string }> = {
  verdict: { line: 'bg-emerald-500', text: 'text-emerald-400' },
  timeline: { line: 'bg-sky-500', text: 'text-sky-400' },
  achievements: { line: 'bg-emerald-500', text: 'text-emerald-400' },
  darkside: { line: 'bg-rose-500', text: 'text-rose-400' },
  gameplay: { line: 'bg-sky-500', text: 'text-sky-400' },
  trends: { line: 'bg-amber-500', text: 'text-amber-400' },
};

/** 极简 markdown 内联渲染：仅处理 **加粗**，其余原样输出（whitespace-pre-wrap 保留换行/空格） */
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

function Skeleton() {
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

/**
 * B1 卡片深度展开内容渲染
 * - 从 store 读取 expansions[cardType]
 * - loading 且无内容时显示骨架屏（animate-pulse）
 * - 有内容时流式渲染（whitespace-pre-wrap + **加粗**）
 * - 机密档案风格：左侧强调色竖线，背景比卡片更深
 */
export default function CardExpansion({ cardType }: { cardType: CardType }) {
  const expansion = useOmniVisionStore((s) => s.expansions[cardType]);
  const accent = ACCENT[cardType];

  if (!expansion) return null;

  const { content, loading } = expansion;
  const showSkeleton = loading && !content;

  return (
    <div className="relative z-10 mt-4 overflow-hidden rounded-lg border border-white/5 bg-black/30 animate-fade-in">
      {/* 左侧强调色竖线 */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', accent.line)} />

      <div className="py-3 pl-4 pr-3">
        <div className="mb-2 flex items-center gap-2">
          <span className={cn('text-[9px] font-mono uppercase tracking-[0.25em]', accent.text)}>
            Deep Dive · 深度展开
          </span>
          {loading && <Loader2 className={cn('h-3 w-3 animate-spin', accent.text)} />}
        </div>

        {showSkeleton ? (
          <Skeleton />
        ) : (
          <div className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-300 font-sans">
            {renderInline(content)}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, type FormEvent, type ReactNode } from 'react';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOmniVisionStore } from '@/store/omnivision';
import { useAsk } from '@/hooks/useCardInteraction';
import type { CardType } from '@/types';

const ACCENT: Record<CardType, {
  text: string;
  border: string;
  bg: string;
  hover: string;
  caret: string;
}> = {
  verdict: {
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/[0.06]',
    hover: 'hover:border-emerald-500/50',
    caret: 'bg-emerald-400',
  },
  timeline: {
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/[0.06]',
    hover: 'hover:border-sky-500/50',
    caret: 'bg-sky-400',
  },
  achievements: {
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/[0.06]',
    hover: 'hover:border-emerald-500/50',
    caret: 'bg-emerald-400',
  },
  darkside: {
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/[0.06]',
    hover: 'hover:border-rose-500/50',
    caret: 'bg-rose-400',
  },
  gameplay: {
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/[0.06]',
    hover: 'hover:border-sky-500/50',
    caret: 'bg-sky-400',
  },
  trends: {
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/[0.06]',
    hover: 'hover:border-amber-500/50',
    caret: 'bg-amber-400',
  },
};

/** 极简 markdown 内联渲染：仅处理 **加粗** */
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

/**
 * B4 卡片追问对话框
 * - 嵌入式：卡片底部展开
 * - 迷你输入框 + 发送按钮 + 流式回答区
 * - loading 时显示打字光标动画
 * - 机密档案风格
 */
export default function AskPanel({ cardType }: { cardType: CardType }) {
  const [input, setInput] = useState('');
  const { ask } = useAsk();
  const record = useOmniVisionStore((s) => s.asks[cardType]);
  const cardData = useOmniVisionStore((s) => s.cards[cardType]);
  const accent = ACCENT[cardType];
  const loading = record?.loading ?? false;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || !cardData || loading) return;
    ask(cardType, cardData, q);
    setInput('');
  };

  return (
    <div className="relative z-10 mt-4 overflow-hidden rounded-lg border border-white/5 bg-black/30 animate-fade-in">
      {/* 左侧强调色竖线 */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', accent.caret)} />

      <div className="py-3 pl-4 pr-3">
        <div className="mb-2 flex items-center gap-2">
          <MessageSquare className={cn('h-3 w-3', accent.text)} />
          <span className={cn('text-[9px] font-mono uppercase tracking-[0.25em]', accent.text)}>
            Interrogation · 追问
          </span>
        </div>

        {/* 输入区 */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="针对此卡片提问..."
            className={cn(
              'min-w-0 flex-1 rounded-md border bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-200 font-sans outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.05]',
              accent.border,
              accent.hover,
            )}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="发送追问"
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              accent.border,
              accent.bg,
              accent.text,
              accent.hover,
            )}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </form>

        {/* 回答区 */}
        {record && (record.answer || loading) && (
          <div className="mt-3 rounded-md border border-white/5 bg-white/[0.02] p-2.5">
            {record.question && (
              <div className="mb-1.5 text-[10px] font-mono text-zinc-500">
                <span className={accent.text}>Q &gt;</span> {record.question}
              </div>
            )}
            <div className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-300 font-sans">
              {renderInline(record.answer)}
              {loading && (
                <span
                  className={cn(
                    'ml-0.5 inline-block h-3 w-1.5 animate-pulse align-middle',
                    accent.caret,
                  )}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

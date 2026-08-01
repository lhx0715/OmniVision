import { useState } from 'react';
import { AlertTriangle, Expand, MessageSquare, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DarksideCardData } from '@/types';
import { useOmniVisionStore } from '@/store/omnivision';
import { useExpand, useAsk } from '@/hooks/useCardInteraction';
import CardExpansion from '@/components/CardExpansion';
import AskPanel from '@/components/AskPanel';

type Severity = 'high' | 'medium' | 'low';

// 每页显示的争议条数
const CONTROVERSIES_PER_PAGE = 4;

const SEVERITY: Record<Severity, {
  dot: string;
  label: string;
  text: string;
  bar: string;
  pct: number;
  glow: string;
}> = {
  high: {
    dot: 'bg-rose-500',
    label: '高危',
    text: 'text-rose-400',
    bar: 'from-rose-600 to-rose-400',
    pct: 95,
    glow: 'shadow-rose-500/30',
  },
  medium: {
    dot: 'bg-orange-400',
    label: '中危',
    text: 'text-orange-300',
    bar: 'from-orange-500 to-amber-400',
    pct: 60,
    glow: 'shadow-orange-500/20',
  },
  low: {
    dot: 'bg-amber-400',
    label: '低危',
    text: 'text-amber-300',
    bar: 'from-amber-500 to-yellow-300',
    pct: 30,
    glow: 'shadow-amber-500/15',
  },
};

export default function DarksideCard({ data }: { data: DarksideCardData }) {
  const controversies = data.controversies ?? [];

  // 分页状态
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(controversies.length / CONTROVERSIES_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * CONTROVERSIES_PER_PAGE;
  const pageEnd = Math.min(pageStart + CONTROVERSIES_PER_PAGE, controversies.length);
  const pageControversies = controversies.slice(pageStart, pageEnd);

  const { expand } = useExpand();
  const phase = useOmniVisionStore((s) => s.phase);
  const expandedCard = useOmniVisionStore((s) => s.expandedCard);
  const setExpandedCard = useOmniVisionStore((s) => s.setExpandedCard);
  const isExpanded = expandedCard === 'darkside';
  const [showAsk, setShowAsk] = useState(false);

  // 风险指数汇总（基于全部争议，而非当前页）
  const riskScore = controversies.reduce((acc, c) => {
    const sev = (c.severity as Severity) ?? 'medium';
    return acc + (SEVERITY[sev]?.pct ?? 60);
  }, 0);
  const avgRisk = controversies.length > 0 ? Math.round(riskScore / controversies.length) : 0;

  return (
    <div className="dossier-card corner-brackets rounded-2xl border border-rose-500/15 p-6 h-full flex flex-col relative overflow-hidden
                    hover:border-rose-500/40 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-rose-500/10">
      {/* 警示斜纹背景 */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, #f43f5e 0, #f43f5e 1px, transparent 1px, transparent 12px)',
        }}
      />
      {/* 背景大编号 */}
      <span className="bg-number text-rose-500" style={{ top: '-1rem', right: '0.5rem' }}>04</span>

      {/* 头部 */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="pulse-dot rose inline-block h-2 w-2 rounded-full bg-rose-500" />
          <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-rose-400/90">
            Darkside
          </span>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'results' && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (isExpanded) setExpandedCard(null);
                  else expand('darkside', data);
                }}
                title={isExpanded ? '收起展开' : '深度展开'}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-rose-500/20 bg-rose-500/[0.04] text-rose-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10"
              >
                {isExpanded ? <X className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => setShowAsk((v) => !v)}
                title={showAsk ? '收起追问' : '追问此卡片'}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-rose-500/20 bg-rose-500/[0.04] text-rose-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10"
              >
                {showAsk ? <X className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
              </button>
            </>
          )}
          <span className="classification-stamp text-rose-400 border-rose-500/30">
            Red Flag
          </span>
        </div>
      </div>

      {/* 风险指数仪表 */}
      <div className="relative z-10 mt-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-rose-400 font-mono tabular-nums leading-none">
              {avgRisk}
            </span>
            <span className="text-[10px] font-mono text-zinc-600">/ 100 风险指数</span>
          </div>
          <div className="mt-1.5 h-1 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className="data-bar-fill h-full rounded-full bg-gradient-to-r from-rose-600 via-rose-400 to-orange-400"
              style={{ width: `${avgRisk}%` }}
            />
          </div>
        </div>
      </div>

      {/* 争议清单标题 + 分页 */}
      <div className="relative z-10 mt-4 flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-600">
          Red Flags · {controversies.length} 项
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded border border-rose-500/20 transition-colors',
                safePage === 0
                  ? 'text-zinc-700 border-white/5 cursor-not-allowed'
                  : 'text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10',
              )}
              aria-label="上一页"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="text-[10px] font-mono tabular-nums text-rose-400/70 min-w-[44px] text-center">
              {safePage + 1}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage === totalPages - 1}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded border border-rose-500/20 transition-colors',
                safePage === totalPages - 1
                  ? 'text-zinc-700 border-white/5 cursor-not-allowed'
                  : 'text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10',
              )}
              aria-label="下一页"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* 争议清单 */}
      <div className="relative z-10 mt-3 flex flex-col gap-3 flex-1 overflow-hidden">
        {pageControversies.map((c, localI) => {
          const i = pageStart + localI;
          const sev = SEVERITY[(c.severity as Severity) ?? 'medium'] ?? SEVERITY.medium;
          return (
            <div
              key={`${c.title}-${i}`}
              className="animate-fade-in-up group rounded-lg border border-rose-500/10 bg-rose-500/[0.02] p-2.5 hover:bg-rose-500/[0.05] transition-colors"
              style={{ animationDelay: `${localI * 110}ms` }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', sev.text)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-zinc-100 font-sans leading-tight flex-1">
                      {c.title}
                    </h4>
                    <span className={cn('flex items-center gap-1 text-[9px] font-mono shrink-0', sev.text)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', sev.dot)} />
                      {sev.label}
                    </span>
                  </div>
                  {c.detail && (
                    <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">{c.detail}</p>
                  )}
                  {/* 严重度条 */}
                  <div className="mt-1.5 h-0.5 w-full rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={cn('data-bar-fill h-full rounded-full bg-gradient-to-r', sev.bar)}
                      style={{ width: `${sev.pct}%`, animationDelay: `${localI * 110 + 200}ms` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isExpanded && <CardExpansion cardType="darkside" />}
      {showAsk && <AskPanel cardType="darkside" />}
    </div>
  );
}

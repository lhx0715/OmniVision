import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AchievementsCardData } from '@/types';

// 每页显示的硬指标数（2 列网格，4 条 = 2 行，保证翻页体验）
const ACHIEVEMENTS_PER_PAGE = 4;

/** 从 metric 字符串中尝试提取数值用于条形图相对长度 */
function extractMagnitude(metric: string): number {
  const match = metric.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return 50;
  const n = parseFloat(match[1]);
  if (n >= 1000) return 95;
  if (n >= 100) return 75;
  if (n >= 10) return 60;
  return 45;
}

export default function AchievementsCard({ data }: { data: AchievementsCardData }) {
  const items = data.items ?? [];

  // 分页状态：当硬指标数超过 ACHIEVEMENTS_PER_PAGE 时分页
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / ACHIEVEMENTS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * ACHIEVEMENTS_PER_PAGE;
  const pageEnd = Math.min(pageStart + ACHIEVEMENTS_PER_PAGE, items.length);
  const pageItems = items.slice(pageStart, pageEnd);

  return (
    <div className="dossier-card corner-brackets rounded-2xl border border-emerald-500/15 p-6 h-full flex flex-col relative
                    hover:border-emerald-500/40 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-emerald-500/10">
      {/* 背景大编号 */}
      <span className="bg-number text-emerald-500" style={{ top: '-1rem', right: '1rem' }}>03</span>

      {/* 头部 */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="pulse-dot emerald inline-block h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-emerald-400/90">
            Achievements
          </span>
          <span className="text-[10px] font-mono text-zinc-600">· 硬核战绩</span>
        </div>
        <span className="classification-stamp text-emerald-400 border-emerald-500/30">
          Metrics
        </span>
      </div>

      {/* 硬指标标题 + 分页 */}
      <div className="relative z-10 mt-4 flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-600">
          Hard Metrics · {items.length} 项
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded border border-emerald-500/20 transition-colors',
                safePage === 0
                  ? 'text-zinc-700 border-white/5 cursor-not-allowed'
                  : 'text-emerald-300 hover:border-emerald-500/40 hover:bg-emerald-500/10',
              )}
              aria-label="上一页"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="text-[10px] font-mono tabular-nums text-emerald-400/70 min-w-[44px] text-center">
              {safePage + 1}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage === totalPages - 1}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded border border-emerald-500/20 transition-colors',
                safePage === totalPages - 1
                  ? 'text-zinc-700 border-white/5 cursor-not-allowed'
                  : 'text-emerald-300 hover:border-emerald-500/40 hover:bg-emerald-500/10',
              )}
              aria-label="下一页"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* 数据条形图主体 */}
      <div className="relative z-10 mt-4 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 content-start">
        {pageItems.map((item, localI) => {
          const i = pageStart + localI; // 映射到全局编号
          const magnitude = extractMagnitude(item.metric);
          return (
            <div
              key={`${item.label}-${i}`}
              className="group animate-fade-in-up"
              style={{ animationDelay: `${localI * 100}ms` }}
            >
              {/* 指标编号 + 大号数值 */}
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-emerald-500/50 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-2xl md:text-3xl font-black text-emerald-400 font-mono leading-none tabular-nums tracking-tight">
                  {item.metric}
                </span>
              </div>
              {/* 标签 */}
              <div className="mt-1.5 text-xs font-medium text-zinc-200">{item.label}</div>
              {/* 数据条 */}
              <div className="mt-2 h-1 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  className="data-bar-fill h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-300"
                  style={{ width: `${magnitude}%`, animationDelay: `${localI * 100 + 200}ms` }}
                />
              </div>
              {/* 刻度 */}
              <div className="mt-1 flex justify-between text-[8px] font-mono text-zinc-700">
                <span>0</span>
                <span>·</span>
                <span>·</span>
                <span>MAX</span>
              </div>
              {/* 背景 */}
              {item.context && (
                <div className="mt-1.5 text-[11px] text-zinc-500 leading-snug">
                  {item.context}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部汇总条 */}
      <div className="relative z-10 mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
          Σ {items.length} 项硬指标{totalPages > 1 && ` · 第 ${safePage + 1}/${totalPages} 页`}
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: 8 }).map((_, i) => {
            const heights = [14, 8, 18, 11, 16, 9, 13, 10];
            return (
              <span
                key={i}
                className="w-1 bg-emerald-500/30"
                style={{ height: `${heights[i]}px` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

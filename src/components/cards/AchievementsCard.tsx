import type { AchievementsCardData } from '@/types';

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

      {/* 数据条形图主体 */}
      <div className="relative z-10 mt-5 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 content-start">
        {items.map((item, i) => {
          const magnitude = extractMagnitude(item.metric);
          return (
            <div
              key={`${item.label}-${i}`}
              className="group animate-fade-in-up"
              style={{ animationDelay: `${i * 100}ms` }}
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
                  style={{ width: `${magnitude}%`, animationDelay: `${i * 100 + 200}ms` }}
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
          Σ {items.length} 项硬指标
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

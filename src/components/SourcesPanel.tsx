import { useState } from 'react';
import { ChevronDown, ExternalLink, Database, ShieldCheck, Clock, Layers } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';
import type { SourceStats, IntelSource } from '@/types';

/** 从 URL 提取域名（失败时回退到原 URL） */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** 信源中文名映射（用于构成条展示） */
const SOURCE_LABELS: Record<string, string> = {
  tavily: 'Tavily',
  exa: 'Exa',
  github: 'GitHub',
  news: '新闻',
  social: '社媒',
};

/** 信源颜色映射（构成条分段着色） */
const SOURCE_COLORS: Record<string, string> = {
  tavily: 'bg-emerald-500',
  exa: 'bg-violet-500',
  github: 'bg-sky-500',
  news: 'bg-amber-500',
  social: 'bg-rose-500',
};

/** 置信度徽标配置 */
const CONFIDENCE_BADGE: Record<
  NonNullable<IntelSource['confidence']>,
  { label: string; color: string; title: string }
> = {
  high: {
    label: '多源印证',
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.06]',
    title: '≥2 个独立信源印证，或来自权威域名',
  },
  medium: {
    label: '单源新鲜',
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/[0.06]',
    title: '单一信源但发布时间在 1 年内',
  },
  low: {
    label: '待验证',
    color: 'text-zinc-500 border-zinc-600/30 bg-zinc-500/[0.04]',
    title: '单一信源且无时间或较陈旧',
  },
};

/** 格式化时间跨度为简洁展示（如 2019–2026） */
function formatTimeSpan(span?: { earliest?: string; latest?: string }): string | null {
  if (!span || !span.earliest || !span.latest) return null;
  const extractYear = (s: string) => {
    const m = s.match(/\d{4}/);
    return m ? m[0] : null;
  };
  const early = extractYear(span.earliest);
  const late = extractYear(span.latest);
  if (!early || !late) return null;
  return early === late ? early : `${early}–${late}`;
}

/** 信源构成条 — PRD-01 M3 核心展示组件 */
function SourceCompositionBar({ stats }: { stats: SourceStats }) {
  const total = stats.totalSources || 0;
  const entries = Object.entries(stats.bySource || {}).filter(([, n]) => n > 0);
  const timeSpan = formatTimeSpan(stats.timeSpan);
  const dimCount = stats.coveredDimensions?.length ?? 0;
  const totalDim = 6;

  return (
    <div className="space-y-2">
      {/* 第一行：构成条 + 数值标签 */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">
          构成
        </span>
        {/* 分段进度条 */}
        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-zinc-800/60 flex">
          {entries.map(([src, n]) => {
            const pct = total > 0 ? (n / total) * 100 : 0;
            const color = SOURCE_COLORS[src] ?? 'bg-zinc-500';
            return (
              <div
                key={src}
                className={cn('h-full transition-all duration-500', color)}
                style={{ width: `${pct}%` }}
                title={`${SOURCE_LABELS[src] ?? src}: ${n}`}
              />
            );
          })}
        </div>
        <span className="shrink-0 text-[11px] font-mono text-zinc-400">
          去重后 <span className="text-emerald-400 font-bold">{total}</span> 源
        </span>
      </div>

      {/* 第二行：分源明细 + 维度 + 时间跨度 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono">
        {entries.map(([src, n]) => (
          <span key={src} className="flex items-center gap-1 text-zinc-500">
            <span className={cn('h-1.5 w-1.5 rounded-full', SOURCE_COLORS[src] ?? 'bg-zinc-500')} />
            <span className="text-zinc-400">{SOURCE_LABELS[src] ?? src}</span>
            <span className="text-zinc-300">{n}</span>
          </span>
        ))}

        {/* 维度覆盖 */}
        <span className="flex items-center gap-1 text-zinc-500">
          <Layers className="h-2.5 w-2.5" />
          <span className="text-zinc-400">维度</span>
          <span className={cn(dimCount >= 4 ? 'text-emerald-400' : 'text-amber-400')}>
            {dimCount}/{totalDim}
          </span>
        </span>

        {/* 时间跨度 */}
        {timeSpan && (
          <span className="flex items-center gap-1 text-zinc-500">
            <Clock className="h-2.5 w-2.5" />
            <span className="text-zinc-400">时间</span>
            <span className="text-cyan-400">{timeSpan}</span>
          </span>
        )}
      </div>

      {/* 对比文案（PRD-01 FR-05） */}
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600">
        ▸ 本报告聚合 {total} 源 · {dimCount} 维交叉验证 · 通用模型通常仅引用 3~6 源
      </p>
    </div>
  );
}

export default function SourcesPanel() {
  const sources = useOmniVisionStore((s) => s.sources);
  const sourceStats = useOmniVisionStore((s) => s.sourceStats);
  const [expanded, setExpanded] = useState(false);
  // A3 数字滚动 — 数据源数量从 0 滚动到 sources.length
  const sourceCount = useCountUp(sources.length);

  if (sources.length === 0) return null;

  // 最多展示 10 条
  const display = sources.slice(0, 10);

  // 统计 high 置信度数量（用于头部摘要）
  const highConfidenceCount = sources.filter((s) => s.confidence === 'high').length;

  return (
    <div className="corner-brackets rounded-xl border border-emerald-500/15 bg-zinc-900/30 backdrop-blur-sm animate-fade-in overflow-hidden">
      {/* 折叠态头部条 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-emerald-500/[0.04]"
      >
        <Database className="h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">
          Sources
        </span>
        <span className="shrink-0 text-zinc-700">·</span>
        <span className="shrink-0 text-[11px] font-mono text-zinc-400">
          基于 <span className="text-emerald-400">{sourceCount}</span> 个数据源生成
        </span>
        {highConfidenceCount > 0 && (
          <>
            <span className="shrink-0 text-zinc-700">·</span>
            <span className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-emerald-400/80">
              <ShieldCheck className="h-2.5 w-2.5" />
              {highConfidenceCount} 源多源印证
            </span>
          </>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-zinc-600 group-hover:text-emerald-400/80 transition-colors">
          {expanded ? '收起' : '展开'}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-300',
              expanded && 'rotate-180',
            )}
          />
        </span>
      </button>

      {/* 信源构成条 — 始终展示（不依赖展开态） */}
      {sourceStats && (
        <div className="border-t border-emerald-500/10 px-4 py-3">
          <SourceCompositionBar stats={sourceStats} />
        </div>
      )}

      {/* 展开态：来源列表 + 置信度徽标 */}
      {expanded && (
        <div className="border-t border-emerald-500/10 px-4 py-3">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {display.map((src, i) => {
              const hostname = extractHostname(src.url);
              const badge = src.confidence ? CONFIDENCE_BADGE[src.confidence] : null;
              return (
                <li key={`${src.url}-${i}`} className="min-w-0">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={src.title}
                    className="group/src flex items-start gap-2 text-[10px] font-mono leading-relaxed transition-colors"
                  >
                    <span className="shrink-0 text-emerald-400/90">
                      S{String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="block truncate text-zinc-300 group-hover/src:text-emerald-300 transition-colors">
                          {src.title}
                        </span>
                        {/* 置信度徽标 */}
                        {badge && (
                          <span
                            className={cn(
                              'shrink-0 rounded border px-1 py-px text-[8px] uppercase tracking-wider',
                              badge.color,
                            )}
                            title={badge.title}
                          >
                            {badge.label}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-zinc-600 group-hover/src:text-zinc-500 transition-colors">
                        <span className="truncate">{hostname}</span>
                        {src.sourceCount && src.sourceCount > 1 && (
                          <span className="shrink-0 text-emerald-500/60">
                            ×{src.sourceCount}
                          </span>
                        )}
                        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50 group-hover/src:opacity-100" />
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          {sources.length > display.length && (
            <p className="mt-3 text-[9px] font-mono uppercase tracking-widest text-zinc-700">
              + {sources.length - display.length} 个来源未展示
            </p>
          )}
        </div>
      )}
    </div>
  );
}

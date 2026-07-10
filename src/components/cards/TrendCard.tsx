import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { TrendCardData } from '@/types';

/** 趋势折线配色（emerald / sky / amber / rose / cyan） */
const SERIES_COLORS = ['#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#06b6d4'];

/** 数值格式化：千分位 + 保留 1 位小数 */
function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return String(Math.round(n * 10) / 10);
}

interface PlotPoint {
  px: number;
  py: number;
  x: string;
  y: number;
}

interface SeriesPlot {
  color: string;
  label: string;
  points: PlotPoint[];
  path: string;
}

export default function TrendCard({ data }: { data: TrendCardData }) {
  const series = data.trends ?? [];
  const [hover, setHover] = useState<{ s: number; p: number } | null>(null);

  // ===== 坐标系计算 =====
  const VW = 360;
  const VH = 210;
  const PAD = { l: 46, r: 16, t: 18, b: 34 };
  const plotX0 = PAD.l;
  const plotX1 = VW - PAD.r;
  const plotY0 = PAD.t;
  const plotY1 = VH - PAD.b;
  const plotW = plotX1 - plotX0;
  const plotH = plotY1 - plotY0;

  // 收集全局 X 轴标签（数值型按数值排序，否则按首次出现顺序）
  const allX: string[] = [];
  for (const s of series) {
    for (const p of s.points) {
      if (!allX.includes(p.x)) allX.push(p.x);
    }
  }
  const allNumeric = allX.every((x) => !isNaN(parseFloat(x)));
  if (allNumeric && allX.length > 1) {
    allX.sort((a, b) => parseFloat(a) - parseFloat(b));
  }

  // Y 轴范围
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  let yMin = Math.min(...allY);
  let yMax = Math.max(...allY);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad;
  yMax += yPad;

  const xToPx = (x: string): number => {
    const idx = allX.indexOf(x);
    if (allX.length <= 1) return plotX0 + plotW / 2;
    return plotX0 + (idx / (allX.length - 1)) * plotW;
  };
  const yToPy = (y: number): number =>
    plotY1 - ((y - yMin) / (yMax - yMin)) * plotH;

  // 构建每条趋势的路径与点位
  const plots: SeriesPlot[] = series.map((s, si) => {
    const pts: PlotPoint[] = s.points.map((p) => ({
      px: xToPx(p.x),
      py: yToPy(p.y),
      x: p.x,
      y: p.y,
    }));
    const path = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(1)} ${p.py.toFixed(1)}`)
      .join(' ');
    return { color: SERIES_COLORS[si % SERIES_COLORS.length], label: s.label, points: pts, path };
  });

  // Y 轴刻度（5 档）
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);

  // X 轴标签密度控制（最多显示 8 个）
  const xStep = allX.length > 8 ? Math.ceil(allX.length / 8) : 1;
  const xLabels = allX.filter((_, i) => i % xStep === 0);

  const hasMultiple = series.length > 1;

  return (
    <div className="dossier-card corner-brackets rounded-2xl border border-amber-500/15 p-6 h-full flex flex-col relative overflow-hidden
                    hover:border-amber-500/40 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-amber-500/10">
      {/* 背景大编号 */}
      <span className="bg-number text-amber-500" style={{ top: '-1rem', right: '0.5rem' }}>06</span>

      {/* 头部 */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="pulse-dot amber inline-block h-2 w-2 rounded-full bg-amber-400" />
          <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-amber-400/90">
            Trends
          </span>
          <span className="text-[10px] font-mono text-zinc-600">· 趋势分析</span>
        </div>
        <span className="classification-stamp text-amber-400 border-amber-500/30">
          Metrics // Trend
        </span>
      </div>

      <div className="relative z-10 mt-1 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
        量化趋势 · {series.length} 条序列
      </div>

      {/* 折线图主体 */}
      <div className="relative z-10 mt-3 flex-1 flex flex-col">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          <defs>
            {plots.map((pl, i) => (
              <linearGradient key={`grad-${i}`} id={`trend-area-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={pl.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={pl.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* Y 轴网格线 + 刻度标签 */}
          {yTicks.map((t, i) => {
            const py = yToPy(t);
            return (
              <g key={`ygrid-${i}`}>
                <line
                  x1={plotX0}
                  y1={py}
                  x2={plotX1}
                  y2={py}
                  stroke="#ffffff"
                  strokeOpacity={i === 0 ? 0.08 : 0.04}
                  strokeWidth="0.5"
                  strokeDasharray={i === 0 ? '' : '2 3'}
                />
                <text
                  x={plotX0 - 6}
                  y={py + 2.5}
                  textAnchor="end"
                  className="fill-zinc-600"
                  style={{ fontSize: '7px', fontFamily: 'monospace' }}
                >
                  {fmt(t)}
                </text>
              </g>
            );
          })}

          {/* X 轴线 */}
          <line x1={plotX0} y1={plotY1} x2={plotX1} y2={plotY1} stroke="#ffffff" strokeOpacity="0.1" strokeWidth="0.6" />

          {/* X 轴标签 */}
          {xLabels.map((x) => {
            const px = xToPx(x);
            return (
              <text
                key={`xlabel-${x}`}
                x={px}
                y={plotY1 + 14}
                textAnchor="middle"
                className="fill-zinc-600"
                style={{ fontSize: '7px', fontFamily: 'monospace' }}
              >
                {x}
              </text>
            );
          })}

          {/* 趋势线 + 数据点 */}
          {plots.map((pl, si) => (
            <g key={`series-${si}`}>
              {/* 填充区域 */}
              {pl.points.length > 1 && (
                <path
                  d={`${pl.path} L ${pl.points[pl.points.length - 1].px.toFixed(1)} ${plotY1.toFixed(1)} L ${pl.points[0].px.toFixed(1)} ${plotY1.toFixed(1)} Z`}
                  fill={`url(#trend-area-${si})`}
                />
              )}
              {/* 折线 */}
              <path
                d={pl.path}
                fill="none"
                stroke={pl.color}
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* 数据点 */}
              {pl.points.map((p, pi) => {
                const isHover = hover && hover.s === si && hover.p === pi;
                return (
                  <g key={`pt-${si}-${pi}`}>
                    <circle
                      cx={p.px}
                      cy={p.py}
                      r={isHover ? 3.2 : 2}
                      fill={isHover ? pl.color : '#09090b'}
                      stroke={pl.color}
                      strokeWidth="1.2"
                      style={{ transition: 'r 0.15s ease' }}
                    />
                    {/* 透明命中区，便于 hover */}
                    <circle
                      cx={p.px}
                      cy={p.py}
                      r="7"
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHover({ s: si, p: pi })}
                      onMouseLeave={() => setHover(null)}
                    />
                  </g>
                );
              })}
            </g>
          ))}

          {/* Tooltip */}
          {hover &&
            (() => {
              const pl = plots[hover.s];
              const p = pl.points[hover.p];
              const tw = 74;
              const th = 24;
              let tx = p.px - tw / 2;
              tx = Math.max(plotX0, Math.min(plotX1 - tw, tx));
              let ty = p.py - th - 5;
              if (ty < plotY0) ty = p.py + 5;
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={tx}
                    y={ty}
                    width={tw}
                    height={th}
                    rx={3}
                    fill="#000000"
                    fillOpacity="0.88"
                    stroke={pl.color}
                    strokeOpacity="0.6"
                    strokeWidth="0.6"
                  />
                  <text
                    x={tx + tw / 2}
                    y={ty + 9}
                    textAnchor="middle"
                    className="fill-zinc-400"
                    style={{ fontSize: '6.5px', fontFamily: 'monospace' }}
                  >
                    {p.x}
                  </text>
                  <text
                    x={tx + tw / 2}
                    y={ty + 18.5}
                    textAnchor="middle"
                    fill={pl.color}
                    style={{ fontSize: '8px', fontFamily: 'monospace', fontWeight: 700 }}
                  >
                    {fmt(p.y)}
                  </text>
                </g>
              );
            })()}
        </svg>

        {/* 图例（多趋势时显示） */}
        {hasMultiple && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {plots.map((pl, i) => (
              <div
                key={`legend-${i}`}
                className="flex items-center gap-1.5 animate-fade-in"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span
                  className="inline-block h-1.5 w-4 rounded-full"
                  style={{ backgroundColor: pl.color }}
                />
                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[120px]">
                  {pl.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部汇总条 */}
      <div className="relative z-10 mt-3 pt-3 border-t border-amber-500/10 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
          Σ {series.length} 序列 · {allX.length} 节点
        </span>
        <div className="flex items-center gap-1">
          {plots.map((pl, i) => (
            <span
              key={`bar-${i}`}
              className="w-1 rounded-full"
              style={{ height: '12px', backgroundColor: pl.color, opacity: 0.5 }}
            />
          ))}
          <TrendingUp className="h-3 w-3 text-amber-400/60 ml-1" />
        </div>
      </div>
    </div>
  );
}

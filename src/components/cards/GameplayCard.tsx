import { useState } from 'react';
import { Expand, X } from 'lucide-react';
import type { GameplayCardData } from '@/types';
import { useOmniVisionStore } from '@/store/omnivision';
import { useExpand } from '@/hooks/useCardInteraction';
import CardExpansion from '@/components/CardExpansion';

interface NodePos {
  x: number;
  y: number;
  name: string;
  position: string;
  interest: string;
}

interface RelationEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  color: string;
  dash: string;
  label: string;
  from: string;
  to: string;
  relation: string;
}

/** 将利益相关方分布到圆周上 */
function layoutNodes(stakeholders: GameplayCardData['stakeholders']): NodePos[] {
  const n = stakeholders?.length ?? 0;
  if (n === 0) return [];
  const cx = 100;
  const cy = 80;
  const r = 58;
  return stakeholders!.map((s, i) => {
    // 从顶部开始顺时针分布
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      name: s.name,
      position: s.position,
      interest: s.interest,
    };
  });
}

/** 关系类型 → 线型 / 颜色
 *  竞争：红色实线 / 合作：翠绿实线 / 监管：蓝色虚线
 *  依赖：琥珀色实线 / 对立：红色虚线 / 其他：灰色实线 */
function relationStyle(relation: string): { color: string; dash: string; label: string } {
  const r = relation.trim();
  if (r.includes('竞争')) return { color: '#f43f5e', dash: '', label: '竞争' };
  if (r.includes('合作')) return { color: '#10b981', dash: '', label: '合作' };
  if (r.includes('监管')) return { color: '#3b82f6', dash: '3 2', label: '监管' };
  if (r.includes('依赖')) return { color: '#f59e0b', dash: '', label: '依赖' };
  if (r.includes('对立')) return { color: '#f43f5e', dash: '3 2', label: '对立' };
  return { color: '#9ca3af', dash: '', label: r || '其他' };
}

/** 沿向量方向缩短线段两端（避免连线压住节点圆） */
function shorten(x1: number, y1: number, x2: number, y2: number, amt: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: x1 + ux * amt,
    y1: y1 + uy * amt,
    x2: x2 - ux * amt,
    y2: y2 - uy * amt,
  };
}

export default function GameplayCard({ data }: { data: GameplayCardData }) {
  const stakeholders = data.stakeholders ?? [];
  const relations = data.relations ?? [];
  const nodes = layoutNodes(stakeholders);
  const cx = 100;
  const cy = 80;

  const [hoverNode, setHoverNode] = useState<number | null>(null);
  const [hoverRel, setHoverRel] = useState<number | null>(null);

  // 名称 → 节点位置
  const nodeByName = new Map<string, NodePos>();
  for (const n of nodes) nodeByName.set(n.name, n);

  // 解析 relations 为可绘制的边（仅保留两端节点都存在的）
  const edges: RelationEdge[] = relations
    .map((rel): RelationEdge | null => {
      const a = nodeByName.get(rel.from);
      const b = nodeByName.get(rel.to);
      if (!a || !b) return null;
      const style = relationStyle(rel.relation);
      const seg = shorten(a.x, a.y, b.x, b.y, 7);
      return {
        ...seg,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        color: style.color,
        dash: style.dash,
        label: style.label,
        from: rel.from,
        to: rel.to,
        relation: rel.relation,
      };
    })
    .filter((e): e is RelationEdge => e !== null);

  const { expand } = useExpand();
  const phase = useOmniVisionStore((s) => s.phase);
  const expandedCard = useOmniVisionStore((s) => s.expandedCard);
  const setExpandedCard = useOmniVisionStore((s) => s.setExpandedCard);
  const isExpanded = expandedCard === 'gameplay';

  // Tooltip 内容计算（节点优先于连线）
  const tooltip = (() => {
    if (hoverNode !== null && nodes[hoverNode]) {
      const n = nodes[hoverNode];
      return { x: n.x, y: n.y, color: '#38bdf8', title: n.name, body: n.interest };
    }
    if (hoverRel !== null && edges[hoverRel]) {
      const e = edges[hoverRel];
      return { x: e.mx, y: e.my, color: e.color, title: `${e.from} ↔ ${e.to}`, body: e.label };
    }
    return null;
  })();

  return (
    <div className="dossier-card corner-brackets rounded-2xl border border-sky-500/15 p-6 h-full flex flex-col relative overflow-hidden
                    hover:border-sky-500/40 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-sky-500/10">
      {/* 背景大编号 */}
      <span className="bg-number text-sky-500" style={{ top: '-1rem', right: '0.5rem' }}>05</span>

      {/* 头部 */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="pulse-dot sky inline-block h-2 w-2 rounded-full bg-sky-400" />
          <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-sky-400/90">
            Network
          </span>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'results' && (
            <button
              type="button"
              onClick={() => {
                if (isExpanded) setExpandedCard(null);
                else expand('gameplay', data);
              }}
              title={isExpanded ? '收起展开' : '深度展开'}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-sky-500/20 bg-sky-500/[0.04] text-sky-300 transition-colors hover:border-sky-500/40 hover:bg-sky-500/10"
            >
              {isExpanded ? <X className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
            </button>
          )}
          <span className="classification-stamp text-sky-400 border-sky-500/30">
            Relations
          </span>
        </div>
      </div>

      <div className="relative z-10 mt-1 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
        关系网 · {stakeholders.length} 方{edges.length > 0 ? ` · ${edges.length} 关系` : ''}
      </div>

      {/* 关系网络图 SVG */}
      <div className="relative z-10 mt-3 flex justify-center">
        <svg viewBox="0 0 200 160" className="w-full max-w-[260px] h-auto">
          <defs>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 外圈装饰 */}
          <circle cx={cx} cy={cy} r="70" fill="none" stroke="#0ea5e9" strokeOpacity="0.08" strokeWidth="0.5" strokeDasharray="2 3" />
          <circle cx={cx} cy={cy} r="58" fill="none" stroke="#0ea5e9" strokeOpacity="0.06" strokeWidth="0.5" />

          {/* 中心到节点的连接线 + 流动光点 */}
          {nodes.map((node, i) => (
            <g key={`line-${i}`}>
              <line
                x1={cx}
                y1={cy}
                x2={node.x}
                y2={node.y}
                stroke="#0ea5e9"
                strokeOpacity="0.3"
                strokeWidth="0.8"
              />
              {/* 沿线流动的光点 */}
              <circle r="1.5" fill="#38bdf8">
                <animateMotion
                  dur={`${2 + i * 0.3}s`}
                  repeatCount="indefinite"
                  path={`M ${cx} ${cy} L ${node.x} ${node.y}`}
                />
              </circle>
            </g>
          ))}

          {/* 节点间关系连线（弦线，按关系类型上色） */}
          {edges.map((e, i) => {
            const isHover = hoverRel === i;
            return (
              <g key={`rel-${i}`}>
                <line
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke={e.color}
                  strokeOpacity={isHover ? 0.95 : 0.55}
                  strokeWidth={isHover ? 1.4 : 1}
                  strokeDasharray={e.dash || undefined}
                  style={{ transition: 'stroke-opacity 0.15s ease, stroke-width 0.15s ease' }}
                />
                {/* 透明命中区，便于 hover */}
                <line
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke="transparent"
                  strokeWidth="6"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoverRel(i)}
                  onMouseLeave={() => setHoverRel(null)}
                />
              </g>
            );
          })}

          {/* 中心节点 */}
          <circle cx={cx} cy={cy} r="20" fill="url(#centerGlow)" />
          <circle cx={cx} cy={cy} r="10" fill="#0ea5e9" fillOpacity="0.15" stroke="#38bdf8" strokeOpacity="0.6" strokeWidth="1" className="animate-pulse-glow" />
          <circle cx={cx} cy={cy} r="3" fill="#38bdf8" />
          <text x={cx} y={cy + 28} textAnchor="middle" className="fill-sky-300" style={{ fontSize: '6px', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            CORE
          </text>

          {/* 利益相关方节点 */}
          {nodes.map((node, i) => {
            const isHover = hoverNode === i;
            return (
              <g
                key={`node-${i}`}
                className="network-node"
                style={{ color: '#38bdf8', cursor: 'pointer' }}
                onMouseEnter={() => setHoverNode(i)}
                onMouseLeave={() => setHoverNode(null)}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isHover ? 8 : 7}
                  fill="#0c4a6e"
                  fillOpacity={isHover ? 0.85 : 0.6}
                  stroke={isHover ? '#7dd3fc' : '#0ea5e9'}
                  strokeOpacity={isHover ? 0.9 : 0.5}
                  strokeWidth="1"
                  style={{ transition: 'r 0.15s ease, stroke-opacity 0.15s ease' }}
                />
                <circle cx={node.x} cy={node.y} r="2" fill="#7dd3fc" />
                <text
                  x={node.x}
                  y={node.y - 11}
                  textAnchor="middle"
                  className={isHover ? 'fill-sky-200' : 'fill-zinc-200'}
                  style={{ fontSize: '6px', fontFamily: 'monospace', fontWeight: 600 }}
                >
                  {node.name.length > 6 ? node.name.slice(0, 6) + '…' : node.name}
                </text>
              </g>
            );
          })}

          {/* Tooltip（节点显示利益诉求 / 连线显示关系类型） */}
          {tooltip &&
            (() => {
              const tw = 92;
              const th = 22;
              let tx = tooltip.x - tw / 2;
              tx = Math.max(2, Math.min(200 - tw - 2, tx));
              let ty = tooltip.y - th - 6;
              if (ty < 2) ty = tooltip.y + 8;
              const title = tooltip.title.length > 16 ? tooltip.title.slice(0, 16) + '…' : tooltip.title;
              const body = tooltip.body.length > 18 ? tooltip.body.slice(0, 18) + '…' : tooltip.body;
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={tx}
                    y={ty}
                    width={tw}
                    height={th}
                    rx={3}
                    fill="#000000"
                    fillOpacity="0.9"
                    stroke={tooltip.color}
                    strokeOpacity="0.6"
                    strokeWidth="0.6"
                  />
                  <text
                    x={tx + tw / 2}
                    y={ty + 8.5}
                    textAnchor="middle"
                    fill={tooltip.color}
                    style={{ fontSize: '6.5px', fontFamily: 'monospace', fontWeight: 700 }}
                  >
                    {title}
                  </text>
                  <text
                    x={tx + tw / 2}
                    y={ty + 17.5}
                    textAnchor="middle"
                    className="fill-zinc-300"
                    style={{ fontSize: '6px', fontFamily: 'monospace' }}
                  >
                    {body}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      {/* 利益相关方明细 */}
      <div className="relative z-10 mt-3 space-y-1.5 flex-1 overflow-hidden">
        {nodes.map((node, i) => (
          <div
            key={`detail-${i}`}
            className="flex items-center gap-2 text-[10px] animate-fade-in"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="font-mono text-sky-500/60 tabular-nums shrink-0">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="font-semibold text-zinc-200 shrink-0 truncate max-w-[60px]">
              {node.name}
            </span>
            <span className="text-zinc-600 shrink-0">·</span>
            <span className="text-zinc-400 truncate">{node.position}</span>
          </div>
        ))}
      </div>

      {/* 底层逻辑 */}
      {data.dynamics && (
        <div className="relative z-10 mt-3 pt-3 border-t border-sky-500/10">
          <div className="text-[9px] font-mono uppercase tracking-widest text-sky-400/70 mb-1">
            Dynamics · 底层逻辑
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-2">{data.dynamics}</p>
        </div>
      )}

      {isExpanded && <CardExpansion cardType="gameplay" />}
    </div>
  );
}

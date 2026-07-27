import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  type Node, type Edge, type NodeMouseHandler,
  Background, Controls, MiniMap,
  Position, Handle, useStore,
} from 'reactflow';
import {
  ArrowLeft, Network, Loader2, ShieldAlert, Circle, Share2, Users, Zap,
  Search, Layers, Eye, EyeOff, X, Inbox, Files,
} from 'lucide-react';
import { useAuthStore, authFetch } from '@/store/auth';
import { cn } from '@/lib/utils';
import 'reactflow/dist/style.css';

// ===== 类型（与后端 FolderGraphNode/FolderGraphEdge 对齐） =====

interface GraphNode {
  id: string;
  label: string;
  entityType: string | null;
  sourceQuery: string | null;
  degree: number;
  isRoot: boolean;
  cardIds: string[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  sourceCardType: string | null;
  sourceQuery: string | null;
  cardIds: string[];
}

type DepthMode = '1' | '2' | 'all';

// ===== 实体类型配色（与 Graph.tsx 一致） =====

const ENTITY_COLORS: Record<string, string> = {
  HUMAN: '#10b981',
  EVENT: '#06b6d4',
  ITEM: '#f59e0b',
  null: '#71717a',
};

const ENTITY_LABELS: Record<string, string> = {
  HUMAN: '人物',
  EVENT: '事件',
  ITEM: '事物',
  null: '未分类',
};

const RELATION_COLORS: Record<string, string> = {
  gameplay: '#8b5cf6',
  darkside: '#f43f5e',
  timeline: '#06b6d4',
  llm: '#f59e0b',
};

// ===== 邻接表 =====

interface AdjEntry {
  neighbors: string[];
  edges: GraphEdge[];
}

function buildAdjacency(nodes: GraphNode[], edges: GraphEdge[]): Map<string, AdjEntry> {
  const map = new Map<string, AdjEntry>();
  for (const n of nodes) map.set(n.id, { neighbors: [], edges: [] });
  for (const e of edges) {
    const s = map.get(e.source);
    const t = map.get(e.target);
    if (s) { s.neighbors.push(e.target); s.edges.push(e); }
    if (t) { t.neighbors.push(e.source); t.edges.push(e); }
  }
  return map;
}

function bfsReachable(adjacency: Map<string, AdjEntry>, seeds: string[], maxDepth: number): Set<string> {
  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = seeds.map((s) => ({ id: s, depth: 0 }));
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (depth >= maxDepth) continue;
    const entry = adjacency.get(id);
    if (entry) {
      for (const nb of entry.neighbors) {
        if (!visited.has(nb)) queue.push({ id: nb, depth: depth + 1 });
      }
    }
  }
  return visited;
}

// ===== 自定义浮动边（直线 + 荧光发光 + 关系标签，复用自 Graph.tsx） =====

interface FloatingEdgeProps {
  id: string;
  source: string;
  target: string;
  style?: React.CSSProperties;
  label?: React.ReactNode;
}

function FloatingEdge({ id, source, target, style = {}, label }: FloatingEdgeProps) {
  const nodeInternals = useStore((store) => store.nodeInternals);
  const sourceNode = nodeInternals.get(source);
  const targetNode = nodeInternals.get(target);
  if (!sourceNode || !targetNode) return null;

  const sourceX = sourceNode.position.x + (sourceNode.width || 40) / 2;
  const sourceY = sourceNode.position.y + (sourceNode.height || 40) / 2;
  const targetX = targetNode.position.x + (targetNode.width || 28) / 2;
  const targetY = targetNode.position.y + (targetNode.height || 28) / 2;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const angle = Math.atan2(dy, dx);

  const srcR = (sourceNode.data as { isFocused?: boolean })?.isFocused ? 32 : 16;
  const tgtR = 14;
  const sx = sourceX + Math.cos(angle) * srcR;
  const sy = sourceY + Math.sin(angle) * srcR;
  const tx = targetX - Math.cos(angle) * tgtR;
  const ty = targetY - Math.sin(angle) * tgtR;

  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;

  const color = (style as { stroke?: string })?.stroke || '#8b5cf6';
  const pathD = `M ${sx} ${sy} L ${tx} ${ty}`;
  const filterId = `fg-glow-${id}`;
  const gradId = `fg-grad-${id}`;

  return (
    <g>
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={gradId} x1={sx} y1={sy} x2={tx} y2={ty} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="50%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={color} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d={pathD} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" opacity={0.18} filter={`url(#${filterId})`} />
      <path d={pathD} fill="none" stroke={`url(#${gradId})`} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={tx} cy={ty} r={3} fill={color}>
        <animate attributeName="r" values="2.5;4;2.5" dur="2.4s" repeatCount="indefinite" />
      </circle>
      {label && (
        <g>
          <rect x={midX - 26} y={midY - 9} width={52} height={18} rx={9} fill="#0a0a0b" fillOpacity={0.92} stroke={color} strokeWidth={1} strokeOpacity={0.65} />
          <rect x={midX - 26} y={midY - 9} width={52} height={18} rx={9} fill={color} fillOpacity={0.08} />
          <text x={midX} y={midY + 3.5} textAnchor="middle" dominantBaseline="middle" fill="#fafafa" fontSize={9} fontWeight={600} fontFamily="ui-monospace, monospace" letterSpacing="0.3px">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

// ===== 自定义节点组件（三态：聚焦 / 邻居 / 暗淡） =====

function EntityNode({ data }: { data: any }) {
  const color = ENTITY_COLORS[data.entityType] || ENTITY_COLORS.null;
  const [hovered, setHovered] = useState(false);
  const baseSize = data.isRoot ? 44 : 28 + Math.min(data.degree * 6, 24);
  const size = data.isFocused ? 60 : data.dim ? Math.max(baseSize - 8, 18) : baseSize;
  const showLabel = data.isFocused || data.isRoot || data.degree >= 3 || hovered;

  return (
    <div
      className="flex flex-col items-center justify-center rounded-full border-2 transition-all duration-300 cursor-pointer"
      style={{
        width: size,
        height: size,
        borderColor: data.isFocused ? color : data.dim ? `${color}20` : `${color}60`,
        backgroundColor: data.isFocused ? `${color}30` : data.dim ? `${color}04` : `${color}08`,
        boxShadow: data.isFocused
          ? `0 0 28px ${color}80, 0 0 60px ${color}40`
          : data.dim
            ? 'none'
            : data.isNeighbor
              ? `0 0 12px ${color}50`
              : `0 0 6px ${color}20`,
        opacity: data.dim ? 0.12 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      {showLabel ? (
        <span className="font-mono text-zinc-100 truncate max-w-[140px] px-1 text-center" style={{ fontSize: data.isFocused ? 11 : data.isRoot ? 10 : 8 }}>
          {data.label}
        </span>
      ) : null}
    </div>
  );
}

const nodeTypes = { entity: EntityNode };
const edgeTypes = { floating: FloatingEdge };

// ===== 主组件 =====

export default function FolderGraph() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);

  const [folderName, setFolderName] = useState<string>('');
  const [allNodes, setAllNodes] = useState<GraphNode[]>([]);
  const [allEdges, setAllEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  const [depth, setDepth] = useState<DepthMode>('all');
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);

  const loadGraph = useCallback(async () => {
    if (!authUser || !id) return;
    setLoading(true);
    try {
      // 并行加载文件夹信息和图谱
      const [folderRes, graphRes] = await Promise.all([
        authFetch('/api/folders'),
        authFetch(`/api/folders/${id}/graph`),
      ]);
      if (folderRes.ok) {
        const fdata = await folderRes.json();
        const found = (fdata.folders || []).find((f: any) => f.id === id);
        if (found) setFolderName(found.name);
      }
      if (graphRes.ok) {
        const gdata = await graphRes.json();
        if (gdata.graph) {
          setAllNodes(gdata.graph.nodes || []);
          setAllEdges(gdata.graph.edges || []);
        } else {
          setAllNodes([]);
          setAllEdges([]);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [authUser, id]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // ===== 邻接表 / 种子节点 / 聚焦簇 =====
  const adjacency = useMemo(() => buildAdjacency(allNodes, allEdges), [allNodes, allEdges]);
  const rootIds = useMemo(() => allNodes.filter((n) => n.isRoot).map((n) => n.id), [allNodes]);

  const focusCluster = useMemo(() => {
    if (!focusedNodeId) return null;
    const entry = adjacency.get(focusedNodeId);
    if (!entry) return { id: focusedNodeId, neighbors: [] as string[], edges: [] as GraphEdge[] };
    return { id: focusedNodeId, neighbors: entry.neighbors, edges: entry.edges };
  }, [focusedNodeId, adjacency]);

  const focusNodeIds = useMemo(
    () => (focusCluster ? new Set([focusCluster.id, ...focusCluster.neighbors]) : null),
    [focusCluster],
  );

  const selectedNode = useMemo(
    () => (focusedNodeId ? allNodes.find((n) => n.id === focusedNodeId) ?? null : null),
    [focusedNodeId, allNodes],
  );

  const selectedConnectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return allEdges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id);
  }, [selectedNode, allEdges]);

  // ===== 可见节点集合 =====
  const visibleIds = useMemo(() => {
    if (allNodes.length === 0) return new Set<string>();
    if (depth === 'all') {
      const all = new Set(allNodes.map((n) => n.id));
      if (focusNodeIds) for (const fid of focusNodeIds) all.add(fid);
      return all;
    }
    const seeds = rootIds.length > 0 ? rootIds : allNodes.slice(0, 1).map((n) => n.id);
    const maxBfsDepth = depth === '2' ? 2 : 1;
    const baseReachable = bfsReachable(adjacency, seeds, maxBfsDepth);
    if (focusNodeIds) for (const fid of focusNodeIds) baseReachable.add(fid);
    return baseReachable;
  }, [allNodes, adjacency, rootIds, depth, focusNodeIds]);

  const visibleNodes = useMemo(
    () => allNodes.filter((n) => visibleIds.has(n.id) && !hiddenTypes.has(n.entityType || 'null')),
    [allNodes, visibleIds, hiddenTypes],
  );

  const visibleEdges = useMemo(
    () => allEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [allEdges, visibleIds],
  );

  const visibleStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const n of visibleNodes) {
      const key = n.entityType || 'null';
      stats[key] = (stats[key] || 0) + 1;
    }
    return stats;
  }, [visibleNodes]);

  // ===== 节点布局 =====
  const cx = 400;
  const cy = 300;

  const rfNodes: Node[] = useMemo(() => {
    if (focusedNodeId && focusCluster) {
      const neighborCount = focusCluster.neighbors.length;
      const radius = Math.max(150, Math.min(220, 90 + neighborCount * 22));
      const neighborSet = new Set(focusCluster.neighbors);
      const nodesForLayout = allNodes.filter((n) => {
        const isFocusedNode = n.id === focusedNodeId;
        const isNeighbor = neighborSet.has(n.id);
        return isFocusedNode || isNeighbor || visibleIds.has(n.id);
      });

      return nodesForLayout.map((node) => {
        const isFocused = node.id === focusedNodeId;
        const isNeighbor = neighborSet.has(node.id);
        let position = { x: cx, y: cy };
        if (isNeighbor) {
          const neighborIdx = focusCluster.neighbors.indexOf(node.id);
          const angle = (neighborIdx / Math.max(neighborCount, 1)) * Math.PI * 2 - Math.PI / 2;
          position = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
        } else if (!isFocused) {
          const idx = allNodes.findIndex((n) => n.id === node.id);
          const ring = Math.floor(Math.max(idx - 1, 0) / 8);
          const angleOffset = (Math.max(idx - 1, 0) % 8) / 8 * Math.PI * 2;
          const r = 120 + ring * 90 + Math.max(0, 5 - node.degree) * 12;
          const angle = angleOffset + ring * 0.4;
          position = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
        }
        return {
          id: node.id,
          data: {
            label: node.label,
            entityType: node.entityType,
            degree: node.degree,
            isRoot: node.isRoot,
            isFocused,
            isNeighbor,
            dim: !isFocused && !isNeighbor,
          },
          position,
          type: 'entity',
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: { transition: 'transform 0.35s ease, opacity 0.35s ease' },
        };
      });
    }

    if (visibleNodes.length === 0) return [];

    const sorted = [...visibleNodes].sort((a, b) => {
      if (a.isRoot && !b.isRoot) return -1;
      if (!a.isRoot && b.isRoot) return 1;
      return b.degree - a.degree;
    });

    return sorted.map((node, i) => {
      if (i === 0) {
        return {
          id: node.id,
          data: { label: node.label, entityType: node.entityType, degree: node.degree, isRoot: node.isRoot, isFocused: false, isNeighbor: false, dim: false },
          position: { x: cx, y: cy },
          type: 'entity',
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: { transition: 'transform 0.35s ease, opacity 0.35s ease' },
        };
      }
      const ring = Math.floor((i - 1) / 8);
      const angleOffset = ((i - 1) % 8) / 8 * Math.PI * 2;
      const radius = 120 + ring * 90 + Math.max(0, 5 - node.degree) * 12;
      const angle = angleOffset + ring * 0.4;
      return {
        id: node.id,
        data: { label: node.label, entityType: node.entityType, degree: node.degree, isRoot: node.isRoot, isFocused: false, isNeighbor: false, dim: false },
        position: { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius },
        type: 'entity',
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: { transition: 'transform 0.35s ease, opacity 0.35s ease' },
      };
    });
  }, [visibleNodes, focusedNodeId, focusCluster, allNodes, visibleIds]);

  const rfEdges: Edge[] = useMemo(() => {
    if (!focusedNodeId) return [];
    return allEdges
      .filter((e) => e.source === focusedNodeId || e.target === focusedNodeId)
      .map((e) => {
        const color = RELATION_COLORS[e.sourceCardType || ''] || '#52525b';
        return { id: e.id, source: e.source, target: e.target, label: e.label, type: 'floating', style: { stroke: color, strokeWidth: 1.5 } };
      });
  }, [allEdges, focusedNodeId]);

  // ===== 交互回调 =====
  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setFocusedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => setFocusedNodeId(null), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusedNodeId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleDepthChange = useCallback((d: DepthMode) => {
    setDepth(d);
    setFocusedNodeId(null);
  }, []);

  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const entityTypes = useMemo(() => {
    const types = new Set<string>();
    for (const n of allNodes) types.add(n.entityType || 'null');
    return Array.from(types);
  }, [allNodes]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allNodes
      .filter((n) => n.label.toLowerCase().includes(q))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 8);
  }, [searchQuery, allNodes]);

  useEffect(() => { setActiveSuggestionIdx(0); }, [searchQuery]);

  const selectNode = useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId);
    setSearchQuery('');
    setShowSuggestions(false);
  }, []);

  const onSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIdx((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = searchResults[activeSuggestionIdx];
      if (target) selectNode(target.id);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      (e.target as HTMLInputElement).blur();
    }
  }, [searchResults, activeSuggestionIdx, selectNode]);

  const focusNeighbor = useCallback((neighborId: string) => {
    setFocusedNodeId(neighborId);
  }, []);

  // ===== 未登录 =====
  if (!authLoading && !authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-violet-400/60 mx-auto" />
          <p className="text-zinc-400 font-mono text-sm tracking-wider">请先登录以查看知识图谱</p>
          <button onClick={() => navigate('/')} className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300 hover:bg-violet-500/20 transition-colors font-mono tracking-wider">
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center space-y-3">
          <Loader2 className="h-6 w-6 text-violet-400 animate-spin mx-auto" />
          <p className="text-xs font-mono text-zinc-600 tracking-wider">构建文件夹图谱...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-zinc-950 via-neutral-950 to-zinc-900 text-zinc-200">
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-violet-500/[0.04] blur-[120px]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.03]">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(`/folder/${id}`)} className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-violet-300 transition-colors tracking-wider shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" />
            文件夹
          </button>
          <div className="h-4 w-px bg-white/10 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <Network className="h-4 w-4 text-violet-400 shrink-0" />
            <h1 className="font-mono text-sm tracking-[0.25em] text-zinc-200 uppercase truncate">
              {folderName || '文件夹'} · 知识图谱
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-600 tracking-wider uppercase shrink-0">
          <span className="flex items-center gap-1">
            <Circle className="h-2 w-2 text-emerald-400" />
            {visibleNodes.length} / {allNodes.length} 节点
          </span>
          <span className="flex items-center gap-1">
            <Share2 className="h-2.5 w-2.5 text-violet-400" />
            {visibleEdges.length} 关系
          </span>
        </div>
      </header>

      {/* 图谱区 */}
      <main className="relative z-10" style={{ height: 'calc(100vh - 65px)' }}>
        {allNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Inbox className="h-16 w-16 text-zinc-700 mb-4" />
            <p className="font-mono text-sm text-zinc-500 tracking-wider mb-1">图谱为空</p>
            <p className="text-xs text-zinc-600 max-w-xs mb-6">
              该文件夹尚未生成图谱，或文件夹内卡片无法抽取实体关系。请返回文件夹详情页点击"生成知识图谱"。
            </p>
            <button onClick={() => navigate(`/folder/${id}`)} className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/20 transition-colors font-mono">
              返回文件夹
            </button>
          </div>
        ) : (
          <div className="relative h-full">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#27272a" gap={20} size={1} />
              <Controls className="!bg-zinc-950/90 !border-white/20 [&_button]:!bg-zinc-900/80 [&_button]:!border-white/20 [&_button]:!text-white [&_button]:!hover:bg-zinc-800/80 [&_button]:!hover:text-violet-300" />
              <MiniMap className="!bg-zinc-950/80 !border-white/10" nodeColor={(n) => ENTITY_COLORS[(n.data as any)?.entityType] || '#52525b'} maskColor="rgba(0,0,0,0.7)" />
            </ReactFlow>

            {/* 聚焦关系卡片 */}
            {selectedNode && (
              <div className="absolute top-4 left-4 z-30 w-64 rounded-xl border border-violet-500/25 bg-zinc-950/95 backdrop-blur-xl p-4 shadow-[0_0_40px_rgba(139,92,246,0.12)] animate-auth-dialog-in">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="text-sm text-zinc-100 font-medium truncate">{selectedNode.label}</h3>
                    <span className="text-[9px] font-mono text-zinc-600 tracking-wider uppercase">
                      {ENTITY_LABELS[selectedNode.entityType || 'null']}
                      {selectedNode.isRoot && ' · 核心节点'}
                    </span>
                  </div>
                  <button onClick={() => setFocusedNodeId(null)} className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-3 text-[10px] font-mono text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    关联度 {selectedNode.degree}
                  </span>
                  <span className="flex items-center gap-1">
                    <Files className="h-3 w-3" />
                    {selectedNode.cardIds?.length || 0} 卡片
                  </span>
                </div>

                {selectedConnectedEdges.length > 0 ? (
                  <div className="pt-2 border-t border-white/[0.06]">
                    <p className="text-[9px] font-mono text-zinc-600 tracking-wider uppercase mb-1.5">
                      关联关系 ({selectedConnectedEdges.length})
                    </p>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {selectedConnectedEdges.map((e) => {
                        const isSource = e.source === selectedNode.id;
                        const otherId = isSource ? e.target : e.source;
                        const otherNode = allNodes.find((n) => n.id === otherId);
                        const edgeColor = RELATION_COLORS[e.sourceCardType || ''] || '#52525b';
                        return (
                          <button
                            key={e.id}
                            onClick={() => otherNode && focusNeighbor(otherNode.id)}
                            className="w-full flex items-center gap-1.5 text-[10px] text-zinc-400 rounded px-1 py-1 hover:bg-white/5 transition-colors text-left"
                          >
                            {isSource && <span className="text-zinc-600">→</span>}
                            <span className={cn('truncate', isSource ? 'text-zinc-400' : 'text-zinc-200')}>
                              {otherNode?.label || '?'}
                            </span>
                            <span className="font-mono shrink-0 ml-auto px-1.5 py-0.5 rounded" style={{ color: edgeColor, backgroundColor: `${edgeColor}15` }}>
                              {e.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-zinc-600 pt-2 border-t border-white/[0.06]">暂无关联关系</p>
                )}
              </div>
            )}

            {/* 顶部工具栏：搜索 + 深度滑块 */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/80 backdrop-blur-sm px-3 py-1.5 w-72 focus-within:border-violet-500/40 transition-all">
                  <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onKeyDown={onSearchKeyDown}
                    placeholder="搜索实体节点..."
                    className="bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 font-mono outline-none w-full tracking-wider"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setShowSuggestions(false); }} className="text-zinc-600 hover:text-zinc-300 shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {showSuggestions && searchQuery.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-auth-dialog-in">
                    {searchResults.length > 0 ? (
                      <div className="py-1 max-h-72 overflow-y-auto">
                        {searchResults.map((n, idx) => {
                          const color = ENTITY_COLORS[n.entityType] || ENTITY_COLORS.null;
                          const isActive = idx === activeSuggestionIdx;
                          return (
                            <button
                              key={n.id}
                              onClick={() => selectNode(n.id)}
                              onMouseEnter={() => setActiveSuggestionIdx(idx)}
                              className={cn('w-full flex items-center gap-2 px-3 py-2 text-left transition-colors', isActive ? 'bg-violet-500/15' : 'hover:bg-white/5')}
                            >
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
                              <span className="text-xs text-zinc-200 font-medium truncate flex-1">{n.label}</span>
                              <span className="text-[9px] font-mono text-zinc-600 shrink-0">{ENTITY_LABELS[n.entityType || 'null']}</span>
                              <span className="text-[9px] font-mono shrink-0 px-1.5 py-0.5 rounded" style={{ color, backgroundColor: `${color}12` }}>·{n.degree}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-3 py-3 text-center">
                        <p className="text-[10px] font-mono text-zinc-600 tracking-wider">未找到匹配的实体节点</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-950/80 backdrop-blur-sm px-2 py-1.5">
                <Layers className="h-3 w-3 text-violet-400 mr-1" />
                {(['1', '2', 'all'] as DepthMode[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => handleDepthChange(d)}
                    className={cn('rounded px-2 py-0.5 text-[10px] font-mono tracking-wider transition-colors', depth === d ? 'bg-violet-500/30 text-violet-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}
                  >
                    {d === 'all' ? '全图' : `${d}度`}
                  </button>
                ))}
              </div>
            </div>

            {/* 右侧面板：分类汇总 */}
            <div className="absolute top-4 right-4 z-20 w-72 rounded-xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-3.5 w-3.5 text-violet-400" />
                <h3 className="text-[11px] font-mono text-zinc-300 tracking-wider uppercase">分类汇总</h3>
              </div>
              {Object.keys(visibleStats).length > 0 ? (
                <div className="space-y-2">
                  {entityTypes.map((type) => {
                    const count = visibleStats[type] || 0;
                    const color = ENTITY_COLORS[type] || ENTITY_COLORS.null;
                    const total = allNodes.filter((n) => (n.entityType || 'null') === type).length;
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[11px] text-zinc-300">{ENTITY_LABELS[type]}</span>
                        <span className="ml-auto text-[10px] font-mono text-zinc-500">
                          {count}
                          {count !== total && <span className="text-zinc-700"> / {total}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-zinc-600">当前视图无可见节点</p>
              )}
              <div className="pt-3 mt-3 border-t border-white/[0.06]">
                <p className="text-[9px] font-mono text-zinc-700 tracking-wider leading-relaxed">
                  当前: {depth === 'all' ? '全图模式' : `${depth}度关联`}
                  <br />
                  点击节点聚焦其关联网络
                </p>
              </div>
            </div>

            {/* 左下角图例 + 筛选器 */}
            <div className="absolute bottom-4 left-4 z-20 rounded-lg border border-white/10 bg-zinc-950/80 backdrop-blur-sm p-3 space-y-2 min-w-[140px]">
              <p className="text-[9px] font-mono text-zinc-600 tracking-widest uppercase mb-1">实体类型筛选</p>
              {entityTypes.map((type) => {
                const isHidden = hiddenTypes.has(type);
                const color = ENTITY_COLORS[type] || ENTITY_COLORS.null;
                return (
                  <label key={type} className="flex items-center gap-2 text-[10px] text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors">
                    <button onClick={() => toggleType(type)} className="shrink-0">
                      {isHidden ? <EyeOff className="h-3 w-3 text-zinc-600" /> : <Eye className="h-3 w-3" style={{ color }} />}
                    </button>
                    <span className={cn(isHidden && 'text-zinc-600 line-through')}>{ENTITY_LABELS[type]}</span>
                    <span className="ml-auto font-mono text-zinc-600">{allNodes.filter((n) => (n.entityType || 'null') === type).length}</span>
                  </label>
                );
              })}
              <div className="h-px bg-white/10 my-1" />
              <p className="text-[9px] font-mono text-zinc-600 tracking-widest uppercase mb-1">关系类型</p>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400"><span className="h-0.5 w-4 bg-violet-500" />博弈</div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400"><span className="h-0.5 w-4 bg-rose-500" />争议</div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400"><span className="h-0.5 w-4 bg-cyan-500" />时序</div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400"><span className="h-0.5 w-4 bg-amber-500" />语义</div>
            </div>

            {/* 底部操作提示 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-full border border-white/[0.06] bg-zinc-950/60 backdrop-blur-sm px-3 py-1">
              <p className="text-[9px] font-mono text-zinc-600 tracking-wider">点击节点聚焦关联 · 点击空白或 ESC 退出</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

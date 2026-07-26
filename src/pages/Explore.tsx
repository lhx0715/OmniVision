/**
 * 探索图谱主页（PRD-02 FR-07/FR-08/FR-09）
 *
 * - 种子节点居中，追问后增量生长
 * - 复用 Graph.tsx 的 EntityNode/FloatingEdge 模式（内联定义）
 * - 回溯滑块过滤 created_by_step ≤ k 的子图
 * - 从收藏图谱导入种子（query 参数 seedLabel/seedType/from）
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactFlow, {
  type Node, type Edge, type NodeMouseHandler,
  Background, Controls, MiniMap, Position, Handle, useStore,
  ReactFlowProvider, useReactFlow,
} from 'reactflow';
import {
  ArrowLeft, Network, Loader2, ShieldAlert,
  Circle, Share2, Plus, FolderOpen, Archive,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useExploreStore } from '@/store/explore';
import { cn } from '@/lib/utils';
import AskDockPanel from '@/components/AskDockPanel';
import BacktrackSlider from '@/components/BacktrackSlider';
import 'reactflow/dist/style.css';

// ===== 实体类型配色 =====

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

// ===== 自定义浮动边（复用 Graph.tsx 模式）=====

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

  const distance = Math.sqrt(dx * dx + dy * dy);
  const curveFactor = Math.min(distance * 0.15, 60);

  const perpX = -dy / distance;
  const perpY = dx / distance;

  const cpX = midX + perpX * curveFactor;
  const cpY = midY + perpY * curveFactor;

  // 贝塞尔曲线在 t=0.5 时的真实中点（P1=P2，所以 B(0.5) = 0.125*P0 + 0.75*P1 + 0.125*P3）
  const curveMidX = 0.125 * sx + 0.75 * cpX + 0.125 * tx;
  const curveMidY = 0.125 * sy + 0.75 * cpY + 0.125 * ty;

  const color = (style as { stroke?: string })?.stroke || '#8b5cf6';
  const pathD = `M ${sx} ${sy} C ${cpX} ${cpY}, ${cpX} ${cpY}, ${tx} ${ty}`;
  const filterId = `glow-${id}`;
  const gradId = `grad-${id}`;

  const baseOpacity = (style as { opacity?: number })?.opacity ?? 0.6;
  const strokeWidth = (style as { strokeWidth?: number })?.strokeWidth ?? 1.5;

  // 标签参数：字体减小，宽度随文字自适应
  const labelText = label != null ? String(label) : '';
  const labelFontSize = 7;
  const charWidth = labelFontSize * 0.95;
  const labelPadding = 5;
  const labelWidth = Math.max(labelText.length * charWidth + labelPadding * 2, 20);
  const labelHeight = labelFontSize + 5;

  return (
    <g style={{ opacity: baseOpacity }}>
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={gradId} x1={sx} y1={sy} x2={tx} y2={ty} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="50%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth * 4} strokeLinecap="round" opacity={0.12} filter={`url(#${filterId})`} />
      <path d={pathD} fill="none" stroke={`url(#${gradId})`} strokeWidth={strokeWidth} strokeLinecap="round" />
      {baseOpacity > 0.4 && (
        <circle cx={tx} cy={ty} r={2} fill={color}>
          <animate attributeName="r" values="2;3;2" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}
      {labelText && baseOpacity > 0.2 && (
        <g>
          {/* 标签背景：不透明，压在连线上，视觉上"打断"连线 */}
          <rect
            x={curveMidX - labelWidth / 2}
            y={curveMidY - labelHeight / 2}
            width={labelWidth}
            height={labelHeight}
            rx={labelHeight / 2}
            fill="#0a0a0b"
            fillOpacity={0.92}
            stroke={color}
            strokeWidth={0.5}
            strokeOpacity={0.45}
          />
          <text
            x={curveMidX}
            y={curveMidY}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fafafa"
            fontSize={labelFontSize}
            fontWeight={500}
            fontFamily="ui-monospace, monospace"
            letterSpacing="0.2px"
          >
            {labelText}
          </text>
        </g>
      )}
    </g>
  );
}

// ===== 自定义节点（五态：聚焦/邻居/父节点/兄弟/远距）=====

function EntityNode({ data }: { data: any }) {
  const color = ENTITY_COLORS[data.entityType] || ENTITY_COLORS.null;
  const [hovered, setHovered] = useState(false);

  const baseSize = data.isSeed ? 44 : 24 + Math.min(data.degree * 4, 16);
  let size = baseSize;
  let opacity = 1;
  let borderOpacity = 0.6;
  let bgOpacity = 0.08;
  let glowOpacity = 0.2;
  let fontSize = 9;
  let fontWeight = 500;

  if (data.isFocused) {
    size = 52;
    opacity = 1;
    borderOpacity = 1;
    bgOpacity = 0.3;
    glowOpacity = 0.8;
    fontSize = 12;
    fontWeight = 600;
  } else if (data.isParent) {
    size = Math.max(baseSize - 4, 20);
    opacity = 0.15;
    borderOpacity = 0.12;
    bgOpacity = 0.03;
    glowOpacity = 0.05;
    fontSize = 8;
  } else if (data.isNeighbor) {
    size = baseSize;
    opacity = 0.95;
    borderOpacity = 0.5;
    bgOpacity = 0.07;
    glowOpacity = 0.35;
    fontSize = 9;
  } else if (data.isSibling) {
    size = Math.max(baseSize - 4, 18);
    opacity = 0.08;
    borderOpacity = 0.08;
    bgOpacity = 0.02;
    glowOpacity = 0;
    fontSize = 8;
  } else if (data.isGlobalView) {
    // 全局视图：所有节点清晰显示
    size = baseSize;
    opacity = 1;
    borderOpacity = 0.65;
    bgOpacity = 0.1;
    glowOpacity = 0.25;
    fontSize = 9;
  } else {
    // 聚焦模式下的远距节点：几乎隐形
    size = Math.max(baseSize - 6, 16);
    opacity = 0.05;
    borderOpacity = 0.05;
    bgOpacity = 0.01;
    glowOpacity = 0;
    fontSize = 7;
  }

  if (hovered) {
    opacity = Math.min(opacity * 1.4, 1);
    fontSize = Math.min(fontSize + 1, 12);
  }

  return (
    <div
      className="flex flex-col items-center justify-center rounded-full border-2 transition-all duration-350 cursor-pointer"
      style={{
        width: size,
        height: size,
        borderColor: `${color}${Math.round(borderOpacity * 255).toString(16).padStart(2, '0')}`,
        backgroundColor: `${color}${Math.round(bgOpacity * 255).toString(16).padStart(2, '0')}`,
        boxShadow: data.isFocused
          ? `0 0 24px ${color}${Math.round(glowOpacity * 80).toString(16).padStart(2, '0')}, 0 0 48px ${color}${Math.round(glowOpacity * 40).toString(16).padStart(2, '0')}`
          : data.isNeighbor
            ? `0 0 8px ${color}${Math.round(glowOpacity * 80).toString(16).padStart(2, '0')}`
            : 'none',
        opacity,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <span
        className="font-mono text-zinc-100 truncate max-w-[130px] px-1 text-center"
        style={{ fontSize, fontWeight }}
      >
        {data.label}
      </span>
    </div>
  );
}

const nodeTypes = { entity: EntityNode };
const edgeTypes = { floating: FloatingEdge };

// ===== 主组件 =====

export default function Explore() {
  return (
    <ReactFlowProvider>
      <ExploreInner />
    </ReactFlowProvider>
  );
}

function ExploreInner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authUser = useAuthStore((s) => s.user);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const authLoading = useAuthStore((s) => s.loading);
  const reactFlow = useReactFlow();

  const store = useExploreStore();
  const { currentSession, nodes, edges, steps, selectedNodeId, backtrackStep, askLoading } = store;

  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newSeedLabel, setNewSeedLabel] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading) restoreSession();
  }, [authLoading, restoreSession]);

  // ===== 初始化：从 query 参数创建会话 或 加载已有会话 =====
  useEffect(() => {
    if (authLoading || !authUser) return;

    const seedLabel = searchParams.get('seedLabel');
    const seedType = searchParams.get('seedType');
    const seedFrom = searchParams.get('from');
    const sessionId = searchParams.get('sessionId');

    const init = async () => {
      setLoading(true);
      setInitError(null);

      try {
        if (sessionId) {
          // 加载已有会话
          await store.loadSession(sessionId);
        } else if (seedLabel) {
          // 从种子创建新会话
          const session = await store.createSession({
            seedLabel,
            seedEntityType: seedType,
            seedFrom: seedFrom || 'manual',
          });
          if (session) {
            await store.loadSession(session.id);
            // 清除 query 参数，避免刷新重复创建
            navigate(`/explore?sessionId=${session.id}`, { replace: true });
          }
        } else {
          // 无参数 → 加载会话列表，让用户选择或新建
          await store.loadSessions();
        }
      } catch (err) {
        setInitError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authUser, searchParams]);

  // ===== 回溯过滤：只显示 created_by_step ≤ backtrackStep 的节点/边 =====
  const filteredNodes = useMemo(() => {
    if (backtrackStep === null) return nodes;
    return nodes.filter((n) => n.createdByStep <= backtrackStep);
  }, [nodes, backtrackStep]);

  const filteredEdges = useMemo(() => {
    if (backtrackStep === null) return edges;
    return edges.filter((e) => e.createdByStep <= backtrackStep);
  }, [edges, backtrackStep]);

  // ===== 邻接表 + 度数 =====
  const degreeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredEdges) {
      map.set(e.fromNodeId, (map.get(e.fromNodeId) || 0) + 1);
      map.set(e.toNodeId, (map.get(e.toNodeId) || 0) + 1);
    }
    return map;
  }, [filteredEdges]);

  // ===== 选中节点的邻居 =====
  const focusNeighbors = useMemo(() => {
    if (!selectedNodeId) return null;
    const neighbors = new Set<string>();
    for (const e of filteredEdges) {
      if (e.fromNodeId === selectedNodeId) neighbors.add(e.toNodeId);
      if (e.toNodeId === selectedNodeId) neighbors.add(e.fromNodeId);
    }
    return neighbors;
  }, [selectedNodeId, filteredEdges]);

  // ===== 基于边关系构建上下文树（父子/兄弟关系）=====
  const contextTree = useMemo(() => {
    const nodeToStep = new Map<string, number>();
    for (const node of filteredNodes) {
      nodeToStep.set(node.id, node.createdByStep);
    }

    const parentMap = new Map<string, string>();
    const childrenMap = new Map<string, string[]>();

    for (const edge of filteredEdges) {
      const parentId = edge.fromNodeId;
      const childId = edge.toNodeId;

      childrenMap.set(parentId, [...(childrenMap.get(parentId) || []), childId]);

      if (!parentMap.has(childId)) {
        parentMap.set(childId, parentId);
      }
    }

    const siblingGroups = new Map<string, Set<string>>();
    for (const [parentId, children] of childrenMap) {
      siblingGroups.set(parentId, new Set(children));
    }

    const seedId = filteredNodes.find((n) => n.createdByStep === 0)?.id;

    const levelMap = new Map<string, number>();
    if (seedId) {
      levelMap.set(seedId, 0);
      const queue: string[] = [seedId];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const currLevel = levelMap.get(curr)!;
        const children = childrenMap.get(curr) || [];
        for (const child of children) {
          if (!levelMap.has(child)) {
            levelMap.set(child, currLevel + 1);
            queue.push(child);
          }
        }
      }
    }

    for (const node of filteredNodes) {
      if (!levelMap.has(node.id)) {
        levelMap.set(node.id, 0);
      }
    }

    return { nodeToStep, parentMap, siblingGroups, childrenMap, levelMap };
  }, [filteredNodes, filteredEdges]);

  // ===== ReactFlow 节点布局：BFS 层级辐射 + 扇区分配 =====
  const cx = 400;
  const cy = 300;

  const rfNodes: Node[] = useMemo(() => {
    if (filteredNodes.length === 0) return [];

    const { parentMap, siblingGroups, childrenMap, levelMap } = contextTree;

    // 聚焦模式：上下文感知布局
    if (selectedNodeId && focusNeighbors) {
      const neighborArr = Array.from(focusNeighbors);
      const neighborRadius = Math.max(140, Math.min(240, 90 + neighborArr.length * 22));

      const parentId = parentMap.get(selectedNodeId);
      const siblingSet = parentId ? (siblingGroups.get(parentId) as Set<string>) || new Set<string>() : new Set<string>();
      const siblings: string[] = Array.from(siblingSet).filter((id) => id !== selectedNodeId);

      const farNodes = filteredNodes.filter((n) => {
        const isFocused = n.id === selectedNodeId;
        const isNeighbor = focusNeighbors.has(n.id);
        const isParent = n.id === parentId;
        const isSibling = siblingSet.has(n.id);
        return !isFocused && !isNeighbor && !isParent && !isSibling;
      });

      const positionCache = new Map<string, { x: number; y: number }>();

      const assignPositions = () => {
        positionCache.set(selectedNodeId, { x: cx, y: cy });

        if (neighborArr.length > 0) {
          const angleStep = (Math.PI * 2) / neighborArr.length;
          for (let i = 0; i < neighborArr.length; i++) {
            const angle = angleStep * i - Math.PI / 2;
            positionCache.set(neighborArr[i], {
              x: cx + Math.cos(angle) * neighborRadius,
              y: cy + Math.sin(angle) * neighborRadius,
            });
          }
        }

        if (parentId) {
          const parentAngle = Math.PI / 4;
          positionCache.set(parentId, {
            x: cx + Math.cos(parentAngle) * (neighborRadius + 80),
            y: cy + Math.sin(parentAngle) * (neighborRadius + 80),
          });
        }

        if (siblings.length > 0) {
          const siblingRadius = neighborRadius + 60;
          const angleStep = (Math.PI * 2) / Math.max(siblings.length, 1);
          for (let i = 0; i < siblings.length; i++) {
            const angle = angleStep * i + Math.PI / 3;
            positionCache.set(siblings[i], {
              x: cx + Math.cos(angle) * siblingRadius,
              y: cy + Math.sin(angle) * siblingRadius,
            });
          }
        }

        if (farNodes.length > 0) {
          const startRadius = neighborRadius + 120;
          const rings = Math.ceil(Math.sqrt(farNodes.length / 6));
          let idx = 0;
          for (let ring = 0; ring < rings; ring++) {
            const radius = startRadius + ring * 70;
            const countInRing = Math.min(6 + ring * 2, farNodes.length - idx);
            const angleStep = (Math.PI * 2) / countInRing;
            for (let i = 0; i < countInRing && idx < farNodes.length; i++) {
              const angle = angleStep * i + ring * 0.5;
              positionCache.set(farNodes[idx].id, {
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius,
              });
              idx++;
            }
          }
        }
      };

      assignPositions();

      return filteredNodes.map((node) => {
        const isFocused = node.id === selectedNodeId;
        const isNeighbor = focusNeighbors.has(node.id);
        const isParent = node.id === parentId;
        const isSibling = siblingSet.has(node.id) && !isFocused;
        const isSeed = node.createdByStep === 0;

        const pos = positionCache.get(node.id) || { x: cx, y: cy };

        return {
          id: node.id,
          data: {
            label: node.label,
            entityType: node.entityType,
            degree: degreeMap.get(node.id) || 0,
            isSeed,
            isFocused,
            isNeighbor,
            isParent,
            isSibling,
            isGlobalView: false,
          },
          position: pos,
          type: 'entity',
          style: { transition: 'transform 0.4s ease, opacity 0.4s ease' },
        };
      });
    }

    // 默认布局：基于 BFS 层级的分层辐射
    const maxLevel = Math.max(...Array.from(levelMap.values()), 0);

    const levelToNodes = new Map<number, string[]>();
    for (const node of filteredNodes) {
      const level = levelMap.get(node.id) || 0;
      const list = levelToNodes.get(level) || [];
      list.push(node.id);
      levelToNodes.set(level, list);
    }

    const positionCache = new Map<string, { x: number; y: number }>();

    const seedId = filteredNodes.find((n) => n.createdByStep === 0)?.id;
    if (seedId) {
      positionCache.set(seedId, { x: cx, y: cy });
    }

    for (let level = 1; level <= maxLevel; level++) {
      const currentNodes = levelToNodes.get(level) || [];
      const prevNodes = levelToNodes.get(level - 1) || [];

      const baseRadius = 140 + level * 100;

      const parentToChildren = new Map<string, string[]>();
      for (const nodeId of currentNodes) {
        const pId = parentMap.get(nodeId);
        if (pId && prevNodes.includes(pId)) {
          const children = parentToChildren.get(pId) || [];
          children.push(nodeId);
          parentToChildren.set(pId, children);
        }
      }

      const processedChildren = new Set<string>();

      let globalAngle = -Math.PI / 2;

      for (const parentId of prevNodes) {
        const parentPos = positionCache.get(parentId);
        if (!parentPos) continue;

        const children = parentToChildren.get(parentId) || [];
        if (children.length === 0) continue;

        const parentAngle = Math.atan2(parentPos.y - cy, parentPos.x - cx);
        const totalChildren = children.length;

        const sectorSize = Math.min((Math.PI * 2) / prevNodes.length, Math.PI * 0.7);
        const startAngle = parentAngle - sectorSize / 2;
        const angleStep = sectorSize / totalChildren;

        for (let i = 0; i < totalChildren; i++) {
          const childId = children[i];
          if (processedChildren.has(childId)) continue;
          processedChildren.add(childId);

          const angle = startAngle + angleStep * i;
          const radius = baseRadius + (i % 2 === 0 ? 0 : 15);

          positionCache.set(childId, {
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
          });
        }

        globalAngle += sectorSize;
      }

      const unprocessed = currentNodes.filter((id) => !processedChildren.has(id));
      if (unprocessed.length > 0) {
        const angleStep = (Math.PI * 2) / unprocessed.length;
        for (let i = 0; i < unprocessed.length; i++) {
          const angle = angleStep * i - Math.PI / 2 + level * 0.2;
          positionCache.set(unprocessed[i], {
            x: cx + Math.cos(angle) * baseRadius,
            y: cy + Math.sin(angle) * baseRadius,
          });
        }
      }
    }

    return filteredNodes.map((node) => {
      const pos = positionCache.get(node.id) || { x: cx, y: cy };
      const isSeed = node.createdByStep === 0;

      return {
        id: node.id,
        data: {
          label: node.label,
          entityType: node.entityType,
          degree: degreeMap.get(node.id) || 0,
          isSeed,
          isFocused: false,
          isNeighbor: false,
          isParent: false,
          isSibling: false,
          isGlobalView: true,
        },
        position: pos,
        type: 'entity',
        style: { transition: 'transform 0.4s ease, opacity 0.4s ease' },
      };
    });
  }, [filteredNodes, selectedNodeId, focusNeighbors, degreeMap, contextTree]);

  // ===== ReactFlow 边：根据节点上下文状态调整亮度 =====
  const rfEdges: Edge[] = useMemo(() => {
    const { parentMap, siblingGroups } = contextTree;

    return filteredEdges.map((e) => {
      // 全局视图：所有边清晰显示
      let opacity = 0.75;
      let strokeWidth = 1.3;

      if (selectedNodeId) {
        const sourceIsFocused = e.fromNodeId === selectedNodeId;
        const targetIsFocused = e.toNodeId === selectedNodeId;
        const sourceIsNeighbor = focusNeighbors?.has(e.fromNodeId) || false;
        const targetIsNeighbor = focusNeighbors?.has(e.toNodeId) || false;
        const sourceIsParent = e.fromNodeId === parentMap.get(selectedNodeId);
        const targetIsParent = e.toNodeId === parentMap.get(selectedNodeId);

        const siblingSet = parentMap.get(selectedNodeId) ? siblingGroups.get(parentMap.get(selectedNodeId)!) || new Set() : new Set();
        const sourceIsSibling = siblingSet.has(e.fromNodeId);
        const targetIsSibling = siblingSet.has(e.toNodeId);

        if (sourceIsFocused || targetIsFocused) {
          opacity = 0.95;
          strokeWidth = 1.8;
        } else if (sourceIsNeighbor && targetIsNeighbor) {
          opacity = 0.55;
          strokeWidth = 1.0;
        } else if (sourceIsNeighbor || targetIsNeighbor) {
          opacity = 0.45;
          strokeWidth = 0.8;
        } else if (sourceIsParent && targetIsParent) {
          opacity = 0.08;
          strokeWidth = 0.4;
        } else if (sourceIsParent || targetIsParent) {
          opacity = 0.06;
          strokeWidth = 0.4;
        } else if (sourceIsSibling && targetIsSibling) {
          opacity = 0.05;
          strokeWidth = 0.3;
        } else if (sourceIsSibling || targetIsSibling) {
          opacity = 0.04;
          strokeWidth = 0.3;
        } else {
          opacity = 0.03;
          strokeWidth = 0.2;
        }
      }

      return {
        id: e.id,
        source: e.fromNodeId,
        target: e.toNodeId,
        label: e.relation,
        type: 'floating',
        style: { stroke: '#8b5cf6', strokeWidth, opacity },
      };
    });
  }, [filteredEdges, selectedNodeId, focusNeighbors, contextTree]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    store.setSelectedNode(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId, store]);

  const onPaneClick = useCallback(() => {
    store.setSelectedNode(null);
  }, [store]);

  // ===== 点击节点时将视图中心移动到该节点 =====
  useEffect(() => {
    if (!selectedNodeId || !reactFlow) return;
    const focusedNode = rfNodes.find((n) => n.id === selectedNodeId);
    if (!focusedNode) return;
    const x = focusedNode.position.x + (focusedNode.width || 40) / 2;
    const y = focusedNode.position.y + (focusedNode.height || 40) / 2;
    reactFlow.setCenter(x, y, { zoom: 1.2, duration: 600 });
  }, [selectedNodeId, reactFlow, rfNodes]);

  // ===== ESC 退出聚焦 =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.setSelectedNode(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store]);

  // ===== 新建探索会话 =====
  const handleCreateSession = async () => {
    if (!newSeedLabel.trim()) return;
    const session = await store.createSession({ seedLabel: newSeedLabel.trim() });
    if (session) {
      await store.loadSession(session.id);
      navigate(`/explore?sessionId=${session.id}`, { replace: true });
      setShowNewDialog(false);
      setNewSeedLabel('');
    }
  };

  // ===== 归档当前会话 =====
  const handleArchive = async () => {
    if (!currentSession) return;
    await store.updateSession(currentSession.id, { status: 'archived' });
    alert('已存入图谱知识库');
  };

  // ===== 未登录 =====
  if (!authLoading && !authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-violet-400/60 mx-auto" />
          <p className="text-zinc-400 font-mono text-sm tracking-wider">请先登录以使用探索图谱</p>
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
          <p className="text-xs font-mono text-zinc-600 tracking-wider">初始化探索图谱...</p>
        </div>
      </div>
    );
  }

  // ===== 无会话：选择或新建 =====
  if (!currentSession) {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-zinc-950 via-neutral-950 to-zinc-900 text-zinc-200">
        <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-violet-500/[0.04] blur-[120px]" />
        <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.03]">
          <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-violet-300 transition-colors tracking-wider">
            <ArrowLeft className="h-3.5 w-3.5" />
            首页
          </button>
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-violet-400" />
            <h1 className="font-mono text-sm tracking-[0.25em] text-zinc-200 uppercase">探索图谱</h1>
          </div>
          <button onClick={() => navigate('/graph-library')} className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-violet-300 transition-colors">
            <FolderOpen className="h-3.5 w-3.5" />
            知识库
          </button>
        </header>

        <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-65px)] px-6">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center">
              <Network className="h-16 w-16 text-violet-400/40 mx-auto mb-4" />
              <h2 className="text-lg text-zinc-200 font-medium mb-1">开启一次探索</h2>
              <p className="text-xs text-zinc-600">输入一个实体作为种子，追问关系，图谱动态生长</p>
            </div>

            {/* 新建会话 */}
            <div className="rounded-xl border border-violet-500/15 bg-zinc-950/60 p-4 space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 focus-within:border-violet-500/40 transition-all">
                <Plus className="h-3.5 w-3.5 text-violet-400/60" />
                <input
                  type="text"
                  value={newSeedLabel}
                  onChange={(e) => setNewSeedLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateSession()}
                  placeholder="输入种子实体（如：英伟达 / 黄仁勋 / 核聚变）"
                  className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
                />
              </div>
              <button
                onClick={handleCreateSession}
                disabled={!newSeedLabel.trim()}
                className={cn(
                  'w-full rounded-lg px-4 py-2 text-sm font-mono tracking-wider transition-all',
                  newSeedLabel.trim()
                    ? 'bg-violet-500/20 border border-violet-500/40 text-violet-200 hover:bg-violet-500/30'
                    : 'bg-zinc-800/40 border border-white/5 text-zinc-600 cursor-not-allowed',
                )}
              >
                开始探索 →
              </button>
            </div>

            {/* 已有会话列表 */}
            {store.sessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 px-1">
                  最近的探索
                </p>
                {store.sessions.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/explore?sessionId=${s.id}`)}
                    className="w-full flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2.5 hover:border-violet-500/20 hover:bg-violet-500/[0.04] transition-colors text-left"
                  >
                    <Circle className="h-2 w-2 text-violet-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{s.title}</p>
                      <p className="text-[10px] font-mono text-zinc-600">
                        {s.nodeCount} 节点 · {s.stepCount} 步 · {s.status === 'archived' ? '已存档' : '进行中'}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-700">{s.updatedAt?.slice(0, 10)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ===== 探索主页 =====
  return (
    <div className="min-h-screen bg-gradient-to-tr from-zinc-950 via-neutral-950 to-zinc-900 text-zinc-200">
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-violet-500/[0.04] blur-[120px]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-white/[0.03]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/graph-library')} className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-violet-300 transition-colors tracking-wider">
            <ArrowLeft className="h-3.5 w-3.5" />
            知识库
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-violet-400" />
            <h1 className="font-mono text-sm tracking-[0.2em] text-zinc-200 uppercase truncate max-w-[300px]">
              {currentSession.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 统计 */}
          <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 tracking-wider uppercase">
            <span className="flex items-center gap-1">
              <Circle className="h-2 w-2 text-emerald-400" />
              {filteredNodes.length} 节点
            </span>
            <span className="flex items-center gap-1">
              <Share2 className="h-2.5 w-2.5 text-violet-400" />
              {filteredEdges.length} 关系
            </span>
            <span className="flex items-center gap-1">
              {currentSession.stepCount} 步
            </span>
          </div>

          {/* 归档按钮 */}
          {currentSession.status === 'active' && (
            <button
              onClick={handleArchive}
              className="flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-2.5 py-1 text-[10px] font-mono text-violet-300 hover:bg-violet-500/15 transition-colors"
            >
              <Archive className="h-3 w-3" />
              存入知识库
            </button>
          )}
        </div>
      </header>

      {/* 图谱区 */}
      <main className="relative z-10" style={{ height: 'calc(100vh - 65px - 100px)' }}>
        <div className="relative h-full" ref={containerRef}>
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
            <MiniMap
              className="!bg-zinc-950/80 !border-white/10"
              nodeColor={(n) => ENTITY_COLORS[(n.data as any)?.entityType] || '#52525b'}
              maskColor="rgba(0,0,0,0.7)"
            />
          </ReactFlow>

          {/* 回溯滑块 + 轨迹 */}
          <BacktrackSlider />

          {/* 底部操作提示 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-full border border-white/[0.06] bg-zinc-950/60 backdrop-blur-sm px-3 py-1">
            <p className="text-[9px] font-mono text-zinc-600 tracking-wider">
              点击节点追问 · 拖动滑块回溯 · ESC 退出聚焦
            </p>
          </div>
        </div>
      </main>

      {/* 底部追问框 */}
      <AskDockPanel />
    </div>
  );
}

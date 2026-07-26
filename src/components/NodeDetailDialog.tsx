/**
 * 节点详情弹窗
 *
 * 点击图谱节点时弹出，调用 /api/search 深度搜索该实体
 * 以 SSE 流式接收情报卡片并展示，设计风格符合档案库美学
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Loader2, Search, ExternalLink, ShieldAlert,
  Clock, Trophy, AlertTriangle, Swords, TrendingUp, ShieldCheck,
  Network,
} from 'lucide-react';
import { authFetch } from '@/store/auth';
import { cn } from '@/lib/utils';
import type { CardType, CardData, EntityType, IntelSource } from '@/types';

interface NodeDetailDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  entityType: string | null;
}

interface StreamCard {
  cardType: CardType;
  payload: CardData;
}

interface StreamState {
  status: 'idle' | 'searching' | 'done' | 'error' | 'blocked';
  engine: 'live' | 'mock' | null;
  cards: StreamCard[];
  sources: IntelSource[];
  error: string | null;
  entityType: EntityType | null;
}

const CARD_META: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  verdict: { icon: ShieldCheck, label: '定性研判', color: '#10b981' },
  timeline: { icon: Clock, label: '时间线', color: '#06b6d4' },
  achievements: { icon: Trophy, label: '核心成就', color: '#f59e0b' },
  darkside: { icon: AlertTriangle, label: '反向视角', color: '#f43f5e' },
  gameplay: { icon: Swords, label: '博弈面', color: '#8b5cf6' },
  trends: { icon: TrendingUp, label: '趋势', color: '#22c55e' },
};

function parseSSEData(rawEvent: string): Record<string, unknown> | null {
  const lines = rawEvent.split('\n');
  let dataStr = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      dataStr += trimmed.slice(5).trim();
    } else if (trimmed.startsWith('data')) {
      dataStr += trimmed.slice(4).trim();
    }
  }
  if (!dataStr) return null;
  try {
    return JSON.parse(dataStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default function NodeDetailDialog({ open, onClose, label, entityType }: NodeDetailDialogProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<StreamState>({
    status: 'idle',
    engine: null,
    cards: [],
    sources: [],
    error: null,
    entityType: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  // 以当前实体为种子，跳转到探索图谱页（PRD-02 FR-09：从收藏图谱导入起点）
  const handleExploreSeed = () => {
    onClose();
    const params = new URLSearchParams({
      seedLabel: label,
      from: 'graph_node',
    });
    if (entityType) params.set('seedType', entityType);
    navigate(`/explore?${params.toString()}`);
  };

  const startSearch = useCallback(async () => {
    // 中断上一次请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      status: 'searching',
      engine: null,
      cards: [],
      sources: [],
      error: null,
      entityType: null,
    });

    try {
      const res = await authFetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: label, entityType: entityType as EntityType }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setState((s) => ({ ...s, status: 'error', error: '搜索请求失败' }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setState((s) => ({ ...s, status: 'error', error: '无法读取响应流' }));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按 SSE 事件边界（双换行）分割
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const rawEvent of events) {
          if (!rawEvent.trim()) continue;
          const data = parseSSEData(rawEvent);
          if (!data) continue;

          // 拦截
          if (data.blocked) {
            setState((s) => ({
              ...s,
              status: 'blocked',
              error: (data.reason as string) || '内容受限',
            }));
            return;
          }

          // 引擎模式
          if (data.engine) {
            setState((s) => ({ ...s, engine: data.engine as 'live' | 'mock' }));
          }

          // 澄清
          if (data.needsClarify) {
            setState((s) => ({ ...s, status: 'error', error: '查询需要进一步澄清' }));
            return;
          }

          // 卡片
          if (data.cardType && data.payload) {
            const card: StreamCard = {
              cardType: data.cardType as CardType,
              payload: data.payload as CardData,
            };
            setState((s) => ({ ...s, cards: [...s.cards, card] }));
          }

          // 实体类型
          if (data.entityType) {
            setState((s) => ({ ...s, entityType: data.entityType as EntityType }));
          }

          // 信源
          if (data.sources) {
            setState((s) => ({ ...s, sources: data.sources as IntelSource[] }));
          }

          // 完成
          if (data.done) {
            setState((s) => ({ ...s, status: 'done' }));
          }

          // 错误
          if (data.error) {
            setState((s) => ({ ...s, status: 'error', error: data.message as string }));
          }
        }
      }

      // 流结束但未收到 done
      setState((s) => (s.status === 'searching' ? { ...s, status: 'done' } : s));
    } catch (err) {
      if (controller.signal.aborted) return;
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : '网络异常',
      }));
    }
  }, [label, entityType]);

  // 打开时自动搜索
  useEffect(() => {
    if (open) startSearch();
    return () => abortRef.current?.abort();
  }, [open, startSearch]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      {/* 遮罩 */}
      <div onClick={onClose} className="absolute inset-0 bg-zinc-950/85 backdrop-blur-md animate-fade-in" />

      {/* 弹窗主体 */}
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col animate-auth-dialog-in">
        <div className="dossier-card corner-brackets rounded-2xl border border-cyan-500/20 bg-zinc-950/95 backdrop-blur-xl shadow-[0_0_60px_rgba(6,182,212,0.1)] flex flex-col max-h-[85vh] overflow-hidden">
          {/* 顶部标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <Search className="h-4 w-4 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-mono text-sm tracking-[0.2em] text-zinc-200 uppercase truncate">
                  深度情报检索
                </h2>
                <p className="text-[10px] font-mono text-zinc-600 tracking-wider mt-0.5 truncate">
                  DEEP INTEL · {label}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {state.engine && (
                <span className={cn(
                  'text-[9px] font-mono px-2 py-0.5 rounded-full border',
                  state.engine === 'live'
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                )}>
                  {state.engine === 'live' ? 'LIVE' : 'DEMO'}
                </span>
              )}
              <button
                onClick={handleExploreSeed}
                title="以此为起点进入探索图谱"
                className="flex items-center gap-1 rounded-md border border-violet-500/25 bg-violet-500/[0.08] px-2 py-1 text-[10px] font-mono text-violet-300 transition-colors hover:bg-violet-500/20 hover:border-violet-500/40 tracking-wider"
              >
                <Network className="h-3 w-3" />
                探索
              </button>
              <button
                onClick={onClose}
                aria-label="关闭"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-white/5 text-zinc-500 transition-colors hover:text-zinc-200 hover:border-white/15"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 搜索目标标识 */}
          <div className="px-6 py-3 border-b border-white/[0.04] shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-zinc-600">TARGET:</span>
              <span className="text-cyan-300 font-medium">{label}</span>
              {entityType && (
                <span className="text-[9px] font-mono text-zinc-600 px-1.5 py-0.5 rounded border border-white/10">
                  {entityType === 'HUMAN' ? '人物' : entityType === 'EVENT' ? '事件' : entityType === 'ITEM' ? '事物' : entityType}
                </span>
              )}
            </div>
          </div>

          {/* 内容区 */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-[200px]">
            {/* 搜索中 */}
            {state.status === 'searching' && state.cards.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <Loader2 className="h-10 w-10 text-cyan-400 animate-spin" />
                  <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-xl animate-pulse" />
                </div>
                <p className="mt-4 text-xs font-mono text-zinc-500 tracking-wider">
                  正在检索情报数据库...
                </p>
                <p className="mt-1 text-[10px] font-mono text-zinc-700">
                  SEARCHING · {label}
                </p>
              </div>
            )}

            {/* 拦截 */}
            {state.status === 'blocked' && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ShieldAlert className="h-10 w-10 text-rose-500/60 mb-3" />
                <p className="text-xs font-mono text-rose-400/80 tracking-wider mb-1">
                  情报检索受限
                </p>
                <p className="text-[10px] text-zinc-600 max-w-xs">{state.error}</p>
              </div>
            )}

            {/* 错误 */}
            {state.status === 'error' && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-500/50 mb-3" />
                <p className="text-xs font-mono text-amber-400/80 tracking-wider mb-1">
                  检索异常
                </p>
                <p className="text-[10px] text-zinc-600 max-w-xs">{state.error}</p>
                <button
                  onClick={startSearch}
                  className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20 transition-colors font-mono"
                >
                  重新检索
                </button>
              </div>
            )}

            {/* 情报卡片流 */}
            {state.cards.length > 0 && (
              <div className="space-y-3">
                {state.cards.map((card, i) => (
                  <CardRenderer key={i} card={card} />
                ))}

                {/* 搜索中后续卡片 */}
                {state.status === 'searching' && (
                  <div className="flex items-center gap-2 py-3 px-2">
                    <Loader2 className="h-3 w-3 text-cyan-400 animate-spin" />
                    <span className="text-[10px] font-mono text-zinc-600 tracking-wider">
                      正在生成更多情报卡片...
                    </span>
                  </div>
                )}

                {/* 完成 */}
                {state.status === 'done' && (
                  <div className="flex items-center gap-2 py-3 px-2 border-t border-white/[0.04] mt-2">
                    <ShieldCheck className="h-3 w-3 text-emerald-400" />
                    <span className="text-[10px] font-mono text-emerald-400/70 tracking-wider">
                      情报检索完成 · {state.cards.length} 张卡片
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 信源 */}
          {state.sources.length > 0 && (
            <div className="px-6 py-3 border-t border-white/[0.06] shrink-0">
              <p className="text-[9px] font-mono text-zinc-600 tracking-wider uppercase mb-2">
                信源 ({state.sources.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {state.sources.slice(0, 8).map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-cyan-400 transition-colors rounded border border-white/5 bg-white/[0.02] px-1.5 py-0.5 max-w-[200px]"
                  >
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{src.title || src.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 卡片渲染器 =====

function CardRenderer({ card }: { card: StreamCard }) {
  const meta = CARD_META[card.cardType];
  if (!meta) return null;
  const Icon = meta.icon;
  const color = meta.color;

  return (
    <div
      className="relative rounded-xl border bg-white/[0.015] p-4 overflow-hidden"
      style={{ borderColor: `${color}25` }}
    >
      {/* 左侧色条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5"
        style={{ backgroundColor: color, opacity: 0.6 }}
      />

      {/* 头部 */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color }}>
          {meta.label}
        </span>
      </div>

      {/* 内容 */}
      <div className="text-xs text-zinc-300 leading-relaxed">
        <CardContent cardType={card.cardType} payload={card.payload} />
      </div>
    </div>
  );
}

function CardContent({ cardType, payload }: { cardType: CardType; payload: CardData }) {
  switch (cardType) {
    case 'verdict': {
      const p = payload as Extract<CardData, { title: string }>;
      return (
        <div>
          <p className="text-sm text-zinc-100 font-medium mb-1">{p.title}</p>
          {p.subtitle && <p className="text-zinc-500 text-[11px] mb-2">{p.subtitle}</p>}
          {p.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {p.tags.map((tag, i) => (
                <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/20 text-emerald-400/70">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'timeline': {
      const p = payload as Extract<CardData, { events: { year: string; title: string; description: string }[] }>;
      return (
        <div className="space-y-2">
          {p.events?.map((ev, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="font-mono text-[10px] text-cyan-400 shrink-0 w-12 pt-0.5">{ev.year}</span>
              <div className="min-w-0">
                <p className="text-zinc-200 text-[11px] font-medium">{ev.title}</p>
                {ev.description && <p className="text-zinc-500 text-[10px] mt-0.5">{ev.description}</p>}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'achievements': {
      const p = payload as Extract<CardData, { items: { metric: string; label: string; context?: string }[] }>;
      return (
        <div className="grid grid-cols-2 gap-2">
          {p.items?.map((item, i) => (
            <div key={i} className="rounded-lg bg-amber-500/[0.04] border border-amber-500/10 px-2.5 py-1.5">
              <p className="text-amber-300 font-mono text-sm font-bold">{item.metric}</p>
              <p className="text-zinc-500 text-[9px] mt-0.5">{item.label}</p>
              {item.context && <p className="text-zinc-600 text-[9px] mt-0.5">{item.context}</p>}
            </div>
          ))}
        </div>
      );
    }
    case 'darkside': {
      const p = payload as Extract<CardData, { controversies: { title: string; detail: string; severity: string }[] }>;
      return (
        <div className="space-y-2">
          {p.controversies?.map((c, i) => (
            <div key={i} className="rounded-lg bg-rose-500/[0.04] border border-rose-500/10 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  c.severity === 'high' ? 'bg-rose-400' : c.severity === 'medium' ? 'bg-amber-400' : 'bg-zinc-500'
                )} />
                <p className="text-zinc-200 text-[11px] font-medium">{c.title}</p>
              </div>
              {c.detail && <p className="text-zinc-500 text-[10px] mt-1">{c.detail}</p>}
            </div>
          ))}
        </div>
      );
    }
    case 'gameplay': {
      const p = payload as Extract<CardData, { stakeholders: { name: string; position: string; interest: string }[]; dynamics: string }>;
      return (
        <div>
          {p.dynamics && <p className="text-zinc-400 text-[11px] mb-2">{p.dynamics}</p>}
          <div className="space-y-1.5">
            {p.stakeholders?.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px]">
                <span className="text-violet-300 font-medium shrink-0 w-16 truncate">{s.name}</span>
                <span className="text-zinc-500">{s.position}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'trends': {
      const p = payload as Extract<CardData, { trends: { label: string; points: { x: string; y: number }[] }[] }>;
      return (
        <div className="space-y-2">
          {p.trends?.map((t, i) => (
            <div key={i}>
              <p className="text-green-400 text-[10px] font-medium mb-1">{t.label}</p>
              <div className="flex items-end gap-1 h-8">
                {t.points?.map((pt, j) => {
                  const max = Math.max(...t.points.map((p) => p.y), 1);
                  const h = (pt.y / max) * 100;
                  return (
                    <div key={j} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full bg-green-500/30 rounded-sm" style={{ height: `${h}%` }} />
                      <span className="text-[7px] font-mono text-zinc-600">{pt.x}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FolderOpen, Network, Loader2, ShieldAlert, Trash2,
  Calendar, Sparkles, RefreshCw, FileText, Inbox, Circle, Share2,
} from 'lucide-react';
import { useAuthStore, authFetch } from '@/store/auth';
import { cn } from '@/lib/utils';
import LibraryCardDetail from '@/components/LibraryCardDetail';
import { CARD_META, ENTITY_LABELS } from '@/lib/cardMeta';
import type { KnowledgeItem, FolderSummary, FolderGraphMeta } from '@/lib/cardMeta';
import type { CardType, CardData } from '@/types';

/**
 * 文件夹详情页（路由 /folder/:id）
 *
 * - 显示文件夹信息 + 卡片列表（抽屉风格）
 * - 图谱操作区：未生成 → "生成知识图谱"按钮；已生成 → 元信息 + 查看图谱 + 重新生成
 */
export default function FolderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);

  const [folder, setFolder] = useState<FolderSummary | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);

  // 加载文件夹信息（从 /api/folders 列表中找到对应的）
  const loadFolderInfo = useCallback(async () => {
    if (!authUser || !id) return;
    try {
      const res = await authFetch('/api/folders');
      if (res.ok) {
        const data = await res.json();
        const found = (data.folders || []).find((f: FolderSummary) => f.id === id);
        setFolder(found || null);
      }
    } catch {
      // ignore
    }
  }, [authUser, id]);

  // 加载文件夹内卡片
  const loadItems = useCallback(async () => {
    if (!authUser || !id) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/folders/${id}/items`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [authUser, id]);

  useEffect(() => {
    loadFolderInfo();
    loadItems();
  }, [loadFolderInfo, loadItems]);

  // 生成知识图谱
  const handleGenerate = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      const res = await authFetch(`/api/folders/${id}/generate-graph`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.graph) {
          const graphMeta: FolderGraphMeta = {
            id: data.graph.id,
            nodeCount: data.graph.nodeCount,
            edgeCount: data.graph.edgeCount,
            version: data.graph.version,
            generatedAt: data.graph.generatedAt,
          };
          setFolder((prev) => (prev ? { ...prev, graph: graphMeta } : prev));
        }
      }
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  // 删除卡片
  const handleDelete = async (itemId: string) => {
    try {
      const res = await authFetch(`/api/library/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        loadFolderInfo();
      }
    } catch {
      // ignore
    }
  };

  // 未登录
  if (!authLoading && !authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-cyan-400/60 mx-auto" />
          <p className="text-zinc-400 font-mono text-sm tracking-wider">请先登录以查看文件夹</p>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20 transition-colors font-mono tracking-wider"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (authLoading || (loading && !folder)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="h-6 w-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-zinc-950 via-neutral-950 to-zinc-900 text-zinc-200">
      {/* 顶部辉光 */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-cyan-500/[0.04] blur-[120px]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.03]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/library')}
            className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-cyan-300 transition-colors tracking-wider shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            知识库
          </button>
          <div className="h-4 w-px bg-white/10 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="h-4 w-4 text-cyan-400 shrink-0" />
            <h1 className="font-mono text-sm tracking-[0.25em] text-zinc-200 uppercase truncate">
              {folder?.name || '文件夹'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-600 tracking-wider uppercase shrink-0">
          <span>{items.length} 卡片</span>
          {folder?.graph && (
            <>
              <span className="text-zinc-700">/</span>
              <span className="text-violet-400/80">{folder.graph.nodeCount} 节点</span>
            </>
          )}
        </div>
      </header>

      {/* 图谱操作区 */}
      <section className="relative z-10 border-b border-white/[0.03] px-6 py-4">
        {folder?.graph ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 tracking-wider">
              <Network className="h-3.5 w-3.5 text-violet-400" />
              <span>已生成图谱</span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1">
                <Circle className="h-2 w-2 text-emerald-400" />
                {folder.graph.nodeCount} 节点
              </span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1">
                <Share2 className="h-2.5 w-2.5 text-violet-400" />
                {folder.graph.edgeCount} 关系
              </span>
              <span className="text-zinc-700">·</span>
              <span>v{folder.graph.version}</span>
              <span className="text-zinc-700">·</span>
              <span>{folder.graph.generatedAt.slice(0, 10)}</span>
            </div>
            <button
              onClick={() => navigate(`/folder/${id}/graph`)}
              className="flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11px] font-mono text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all tracking-wider uppercase"
            >
              <Network className="h-3 w-3" />
              查看知识图谱
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || items.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-mono text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-all tracking-wider uppercase disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {generating ? '生成中...' : '重新生成'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-mono text-zinc-600 tracking-wider">
              该文件夹尚未生成知识图谱
            </span>
            <button
              onClick={handleGenerate}
              disabled={generating || items.length === 0}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-mono tracking-wider uppercase transition-all',
                generating || items.length === 0
                  ? 'border-white/10 text-zinc-600 cursor-not-allowed'
                  : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/50',
              )}
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {generating ? '生成中...' : '生成知识图谱'}
            </button>
            {items.length === 0 && (
              <span className="text-[10px] font-mono text-zinc-700 tracking-wider">
                文件夹为空，无法生成
              </span>
            )}
          </div>
        )}
      </section>

      {/* 卡片列表 */}
      <main className="relative z-10 flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative mb-6">
              <Inbox className="h-16 w-16 text-zinc-700" />
              <div className="absolute inset-0 rounded-full bg-cyan-500/5 blur-xl" />
            </div>
            <p className="font-mono text-sm text-zinc-500 tracking-wider mb-1">文件夹空置</p>
            <p className="text-xs text-zinc-600 max-w-xs">
              在搜索结果页收藏卡片时选择此文件夹，卡片将归档至此
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 max-w-4xl">
            <div className="flex items-center gap-2 px-3 pb-2">
              <FileText className="h-3 w-3 text-zinc-600" />
              <span className="text-[9px] font-mono text-zinc-600 tracking-widest uppercase">DRAWER · 档案抽屉</span>
              <div className="flex-1 h-px bg-gradient-to-r from-zinc-700/40 to-transparent" />
              <span className="text-[9px] font-mono text-zinc-700">{items.length} 份</span>
            </div>

            {items.map((item, i) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group relative flex items-center gap-3 rounded-lg border border-white/[0.04] bg-zinc-950/40 hover:border-white/[0.08] hover:bg-zinc-900/40 transition-all overflow-hidden cursor-pointer animate-fade-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className={cn('h-full w-1 shrink-0', `bg-${CARD_META[item.cardType].color}-500/40`)} />
                <div className="shrink-0 w-12 text-center">
                  <span className="text-[9px] font-mono text-zinc-700 tracking-wider">
                    #{String(i + 1).padStart(3, '0')}
                  </span>
                </div>
                <div className="shrink-0 w-20">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-mono tracking-wider uppercase',
                      `bg-${CARD_META[item.cardType].color}-500/10 text-${CARD_META[item.cardType].color}-400 border border-${CARD_META[item.cardType].color}-500/20`,
                    )}
                  >
                    {CARD_META[item.cardType].label}
                  </span>
                </div>
                <div className="flex-1 min-w-0 py-2.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm text-zinc-200 truncate">{item.entityName}</span>
                    {item.entityType && (
                      <span className="text-[9px] font-mono text-zinc-600 border border-white/[0.06] rounded px-1 py-0.5">
                        {ENTITY_LABELS[item.entityType] || item.entityType}
                      </span>
                    )}
                  </div>
                  <CardPreviewText cardType={item.cardType} payload={item.cardPayload} />
                </div>
                <div className="shrink-0 hidden sm:flex items-center gap-1 text-[9px] font-mono text-zinc-600">
                  <Calendar className="h-2.5 w-2.5" />
                  {new Date(item.savedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                  className="shrink-0 mr-2 flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                  title="移出文件夹"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 卡片回看层 */}
      {selectedItem && (
        <LibraryCardDetail item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}

// ===== 卡片预览文本提取器（与 Library.tsx 一致） =====

function CardPreviewText({
  cardType,
  payload,
}: {
  cardType: CardType;
  payload: CardData;
}) {
  let preview = '';

  switch (cardType) {
    case 'verdict': {
      const p = payload as any;
      preview = p.summary || p.definition || p.verdict || JSON.stringify(payload).slice(0, 120);
      break;
    }
    case 'timeline': {
      const p = payload as any;
      preview = p.events?.slice(0, 2).map((e: any) => `${e.year}: ${e.title}`).join(' · ') || '';
      break;
    }
    case 'achievements': {
      const p = payload as any;
      preview = p.items?.slice(0, 2).map((i: any) => i.title || i.label).join(' · ') || '';
      break;
    }
    case 'trends': {
      const p = payload as any;
      preview = p.summary || p.description || '趋势数据图表';
      break;
    }
    case 'darkside': {
      const p = payload as any;
      preview = p.controversies?.slice(0, 1).map((c: any) => c.title).join('') || '';
      break;
    }
    case 'gameplay': {
      const p = payload as any;
      preview = p.relations?.slice(0, 2).map((r: any) => `${r.from}-${r.relation}-${r.to}`).join(' · ') || '';
      break;
    }
  }

  if (!preview) preview = '—';

  return <p className="text-xs text-zinc-500 line-clamp-1">{preview}</p>;
}

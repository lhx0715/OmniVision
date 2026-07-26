import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookMarked, LayoutList, LayoutGrid, Search, Trash2,
  Fingerprint, FolderOpen, Network, Loader2, FileText, Calendar,
  ShieldAlert, Inbox,
} from 'lucide-react';
import { useAuthStore, authFetch } from '@/store/auth';
import { cn } from '@/lib/utils';
import LibraryCardDetail from '@/components/LibraryCardDetail';
import type { CardType, EntityType, CardData } from '@/types';

// ===== 类型与卡片元数据（提取至 src/lib/cardMeta.ts，避免与 LibraryCardDetail 循环依赖） =====

import { CARD_META, ENTITY_LABELS } from '@/lib/cardMeta';
import type { KnowledgeItem } from '@/lib/cardMeta';

// ===== 主组件 =====

export default function Library() {
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const authLoading = useAuthStore((s) => s.loading);

  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filterCardType, setFilterCardType] = useState<CardType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ totalItems: 0, totalEntities: 0, totalRelations: 0 });
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);

  // 恢复会话
  useEffect(() => {
    if (authLoading) restoreSession();
  }, [authLoading, restoreSession]);

  // 加载知识库数据
  const loadItems = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCardType !== 'all') params.set('cardType', filterCardType);
      if (searchQuery) params.set('q', searchQuery);
      const res = await authFetch(`/api/library?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [authUser, filterCardType, searchQuery]);

  // 加载统计
  const loadStats = useCallback(async () => {
    if (!authUser) return;
    try {
      const res = await authFetch('/api/library/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch {
      // ignore
    }
  }, [authUser]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 删除条目
  const handleDelete = async (id: string) => {
    try {
      const res = await authFetch(`/api/library/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        loadStats();
      }
    } catch {
      // ignore
    }
  };

  // 未登录引导
  if (!authLoading && !authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-emerald-400/60 mx-auto" />
          <p className="text-zinc-400 font-mono text-sm tracking-wider">请先登录以访问个人知识库</p>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20 transition-colors font-mono tracking-wider"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-zinc-950 via-neutral-950 to-zinc-900 text-zinc-200">
      {/* 顶部辉光 */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-cyan-500/[0.04] blur-[120px]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.03]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-emerald-300 transition-colors tracking-wider"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-cyan-400" />
            <h1 className="font-mono text-sm tracking-[0.25em] text-zinc-200 uppercase">个人知识库</h1>
          </div>
        </div>

        {/* 统计 + 图谱入口 */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-[10px] font-mono text-zinc-600 tracking-wider uppercase">
            <span>{stats.totalItems} 档案</span>
            <span className="text-zinc-700">/</span>
            <span>{stats.totalEntities} 实体</span>
            <span className="text-zinc-700">/</span>
            <span>{stats.totalRelations} 关系</span>
          </div>
          <button
            onClick={() => navigate('/graph')}
            className="flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/[0.04] px-2.5 py-1 text-violet-300 transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 text-[10px] font-mono tracking-widest uppercase"
          >
            <Network className="h-3 w-3" />
            知识图谱
          </button>
          <button
            onClick={() => navigate('/graph-library')}
            className="flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/[0.04] px-2.5 py-1 text-violet-300 transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 text-[10px] font-mono tracking-widest uppercase"
          >
            <FolderOpen className="h-3 w-3" />
            探索图谱
          </button>
        </div>
      </header>

      {/* 工具栏 */}
      <div className="relative z-10 flex items-center gap-3 px-6 py-3 border-b border-white/[0.03] flex-wrap">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索档案..."
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-cyan-500/30"
          />
        </div>

        {/* 卡片类型筛选 */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setFilterCardType('all')}
            className={cn(
              'rounded-md px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase transition-colors',
              filterCardType === 'all'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-zinc-600 border border-white/[0.04] hover:text-zinc-400'
            )}
          >
            全部
          </button>
          {(Object.keys(CARD_META) as CardType[]).map((ct) => (
            <button
              key={ct}
              onClick={() => setFilterCardType(ct)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase transition-colors',
                filterCardType === ct
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-zinc-600 border border-white/[0.04] hover:text-zinc-400'
              )}
            >
              {CARD_META[ct].label}
            </button>
          ))}
        </div>

        {/* 视图切换 */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
              viewMode === 'list'
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                : 'border-white/[0.04] text-zinc-600 hover:text-zinc-400'
            )}
            title="抽屉视图"
          >
            <LayoutList className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
              viewMode === 'grid'
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                : 'border-white/[0.04] text-zinc-600 hover:text-zinc-400'
            )}
            title="面板视图"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <main className="relative z-10 flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : viewMode === 'list' ? (
          <ListView items={items} onDelete={handleDelete} onSelect={setSelectedItem} />
        ) : (
          <GridView items={items} onDelete={handleDelete} onSelect={setSelectedItem} />
        )}
      </main>

      {/* 卡片回看层 — 点击条目复现原始卡片完整内容 */}
      {selectedItem && (
        <LibraryCardDetail item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}

// ===== 空状态 =====

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative mb-6">
        <Inbox className="h-16 w-16 text-zinc-700" />
        <div className="absolute inset-0 rounded-full bg-cyan-500/5 blur-xl" />
      </div>
      <p className="font-mono text-sm text-zinc-500 tracking-wider mb-1">档案柜空置</p>
      <p className="text-xs text-zinc-600 max-w-xs">
        搜索关键词后，点击卡片右上角的收藏按钮，将情报存入你的个人知识库
      </p>
    </div>
  );
}

// ===== 列表视图 — 抽屉档案风格 =====

function ListView({ items, onDelete, onSelect }: { items: KnowledgeItem[]; onDelete: (id: string) => void; onSelect: (item: KnowledgeItem) => void }) {
  return (
    <div className="space-y-1.5 max-w-4xl">
      {/* 抽屉导轨装饰 */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <FolderOpen className="h-3 w-3 text-zinc-600" />
        <span className="text-[9px] font-mono text-zinc-600 tracking-widest uppercase">DRAWER · 档案抽屉</span>
        <div className="flex-1 h-px bg-gradient-to-r from-zinc-700/40 to-transparent" />
        <span className="text-[9px] font-mono text-zinc-700">{items.length} 份</span>
      </div>

      {items.map((item, i) => (
        <div
          key={item.id}
          onClick={() => onSelect(item)}
          className="group relative flex items-center gap-3 rounded-lg border border-white/[0.04] bg-zinc-950/40 hover:border-white/[0.08] hover:bg-zinc-900/40 transition-all overflow-hidden cursor-pointer animate-fade-in"
          style={{ animationDelay: `${i * 30}ms` }}
        >
          {/* 左侧色条 — 卡片类型标识 */}
          <div
            className={cn(
              'h-full w-1 shrink-0',
              `bg-${CARD_META[item.cardType].color}-500/40`,
            )}
          />

          {/* 档案编号 */}
          <div className="shrink-0 w-12 text-center">
            <span className="text-[9px] font-mono text-zinc-700 tracking-wider">
              #{String(i + 1).padStart(3, '0')}
            </span>
          </div>

          {/* 类型标签 */}
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

          {/* 主内容 */}
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

          {/* 日期 */}
          <div className="shrink-0 hidden sm:flex items-center gap-1 text-[9px] font-mono text-zinc-600">
            <Calendar className="h-2.5 w-2.5" />
            {new Date(item.savedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
          </div>

          {/* 删除按钮 */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            className="shrink-0 mr-2 flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
            title="移出知识库"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ===== 网格视图 — 公告板钉档风格 =====

function GridView({ items, onDelete, onSelect }: { items: KnowledgeItem[]; onDelete: (id: string) => void; onSelect: (item: KnowledgeItem) => void }) {
  return (
    <div className="relative">
      {/* 公告板装饰 */}
      <div className="flex items-center gap-2 px-1 pb-4">
        <FileText className="h-3 w-3 text-zinc-600" />
        <span className="text-[9px] font-mono text-zinc-600 tracking-widest uppercase">PINBOARD · 档案面板</span>
        <div className="flex-1 h-px bg-gradient-to-r from-zinc-700/40 to-transparent" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item, i) => {
          // 轻微随机旋转 — 公告板钉子的自然感
          const rotation = ((i * 37) % 7 - 3) * 0.5;
          return (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              className="group relative animate-fade-in cursor-pointer"
              style={{
                animationDelay: `${i * 40}ms`,
                transform: `rotate(${rotation}deg)`,
              }}
            >
              {/* 钉子装饰 — 顶部居中 */}
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-10">
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-600 shadow-md border border-zinc-500/50 group-hover:bg-cyan-500/60 transition-colors" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-3 w-px bg-zinc-700/30" />
              </div>

              {/* 卡片主体 */}
              <div
                className={cn(
                  'relative rounded-lg border bg-zinc-950/60 p-3 pt-4',
                  'border-white/[0.06] hover:border-white/[0.12]',
                  'shadow-[0_4px_12px_rgba(0,0,0,0.3)]',
                  'transition-all hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)]',
                )}
              >
                {/* 类型标签 */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-mono tracking-wider uppercase',
                      `bg-${CARD_META[item.cardType].color}-500/10 text-${CARD_META[item.cardType].color}-400 border border-${CARD_META[item.cardType].color}-500/20`,
                    )}
                  >
                    {CARD_META[item.cardType].label}
                  </span>
                  {item.entityType && (
                    <span className="text-[8px] font-mono text-zinc-600">
                      {ENTITY_LABELS[item.entityType] || item.entityType}
                    </span>
                  )}
                </div>

                {/* 实体名 */}
                <h3 className="text-sm text-zinc-100 font-medium mb-1 truncate">{item.entityName}</h3>

                {/* 预览文本 */}
                <CardPreviewText cardType={item.cardType} payload={item.cardPayload} className="text-[11px] line-clamp-3" />

                {/* 底部 */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.04]">
                  <span className="text-[8px] font-mono text-zinc-600">
                    {new Date(item.savedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                    className="flex h-6 w-6 items-center justify-center rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-all"
                    title="移出知识库"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== 卡片预览文本提取器 =====

function CardPreviewText({
  cardType,
  payload,
  className,
}: {
  cardType: CardType;
  payload: CardData;
  className?: string;
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

  return <p className={cn('text-xs text-zinc-500 line-clamp-1', className)}>{preview}</p>;
}

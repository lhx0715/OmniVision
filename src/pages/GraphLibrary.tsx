/**
 * 图谱知识库（PRD-02 FR-06 / 2.4 第 8 步）
 *
 * 文件夹视图：列出所有探索会话（active + archived）
 * - 顶部统计 + 新建入口
 * - 过滤：全部 / 进行中 / 已存档
 * - 卡片：标题 / 种子 / 节点数 / 步数 / 时间，支持打开、改名、归档/激活、删除
 *
 * 设计：档案夹 + 荧光辉光风格，violet 主色（与 Explore 一致，区别于 Library 的 cyan）
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FolderOpen, FolderPlus, Network, Loader2, ShieldAlert,
  Circle, Share2, Trash2, Archive, RotateCcw, Pencil, Check, X,
  Search, Inbox, Clock,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useExploreStore, type ExpSession } from '@/store/explore';
import { cn } from '@/lib/utils';

type FilterMode = 'all' | 'active' | 'archived';

export default function GraphLibrary() {
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const authLoading = useAuthStore((s) => s.loading);

  const sessions = useExploreStore((s) => s.sessions);
  const sessionsLoading = useExploreStore((s) => s.sessionsLoading);
  const loadSessions = useExploreStore((s) => s.loadSessions);
  const updateSession = useExploreStore((s) => s.updateSession);
  const deleteSession = useExploreStore((s) => s.deleteSession);

  const [filter, setFilter] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) restoreSession();
  }, [authLoading, restoreSession]);

  const reload = useCallback(async () => {
    if (!authUser) return;
    await loadSessions();
  }, [authUser, loadSessions]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ===== 过滤 =====
  const filteredSessions = sessions.filter((s) => {
    if (filter === 'active' && s.status !== 'active') return false;
    if (filter === 'archived' && s.status !== 'archived') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.seedLabel.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    total: sessions.length,
    active: sessions.filter((s) => s.status === 'active').length,
    archived: sessions.filter((s) => s.status === 'archived').length,
    nodes: sessions.reduce((sum, s) => sum + s.nodeCount, 0),
  };

  // ===== 改名 =====
  const startRename = (s: ExpSession) => {
    setEditingId(s.id);
    setEditingTitle(s.title);
  };

  const commitRename = async () => {
    if (!editingId || !editingTitle.trim()) {
      setEditingId(null);
      return;
    }
    await updateSession(editingId, { title: editingTitle.trim() });
    setEditingId(null);
    setEditingTitle('');
  };

  // ===== 归档 / 重新激活 =====
  const toggleArchive = async (s: ExpSession) => {
    const next = s.status === 'active' ? 'archived' : 'active';
    await updateSession(s.id, { status: next });
  };

  // ===== 删除 =====
  const handleDelete = async (id: string) => {
    await deleteSession(id);
    setConfirmDeleteId(null);
  };

  // ===== 未登录 =====
  if (!authLoading && !authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-violet-400/60 mx-auto" />
          <p className="text-zinc-400 font-mono text-sm tracking-wider">请先登录以查看图谱知识库</p>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300 hover:bg-violet-500/20 transition-colors font-mono tracking-wider"
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
        <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-zinc-950 via-neutral-950 to-zinc-900 text-zinc-200">
      {/* 顶部辉光 */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-violet-500/[0.05] blur-[120px]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.03]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-violet-300 transition-colors tracking-wider"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            首页
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-violet-400" />
            <h1 className="font-mono text-sm tracking-[0.25em] text-zinc-200 uppercase">图谱知识库</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-[10px] font-mono text-zinc-600 tracking-wider uppercase">
            <span>{stats.total} 探索</span>
            <span className="text-zinc-700">/</span>
            <span>{stats.nodes} 节点</span>
            <span className="text-zinc-700">/</span>
            <span className="text-violet-400/80">{stats.archived} 已存档</span>
          </div>
          <button
            onClick={() => navigate('/explore')}
            className="flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/[0.06] px-2.5 py-1 text-violet-300 transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 text-[10px] font-mono tracking-widest uppercase"
          >
            <FolderPlus className="h-3 w-3" />
            新探索
          </button>
        </div>
      </header>

      {/* 工具栏 */}
      <div className="relative z-10 flex items-center gap-3 px-6 py-3 border-b border-white/[0.03] flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索探索标题或种子..."
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/30"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {(['all', 'active', 'archived'] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase transition-colors',
                filter === mode
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                  : 'text-zinc-600 border border-white/[0.04] hover:text-zinc-400',
              )}
            >
              {mode === 'all' ? '全部' : mode === 'active' ? '进行中' : '已存档'}
              <span className="ml-1 opacity-60">
                {mode === 'all' ? stats.total : mode === 'active' ? stats.active : stats.archived}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <main className="relative z-10 flex-1 p-6">
        {sessionsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <EmptyState hasAny={sessions.length > 0} onNew={() => navigate('/explore')} />
        ) : (
          <SessionGrid
            sessions={filteredSessions}
            editingId={editingId}
            editingTitle={editingTitle}
            confirmDeleteId={confirmDeleteId}
            onOpen={(s) => navigate(`/explore?sessionId=${s.id}`)}
            onRenameStart={startRename}
            onRenameChange={setEditingTitle}
            onRenameCommit={commitRename}
            onRenameCancel={() => setEditingId(null)}
            onToggleArchive={toggleArchive}
            onDeleteRequest={setConfirmDeleteId}
            onDeleteConfirm={handleDelete}
            onDeleteCancel={() => setConfirmDeleteId(null)}
          />
        )}
      </main>
    </div>
  );
}

// ===== 空状态 =====

function EmptyState({ hasAny, onNew }: { hasAny: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative mb-6">
        <Inbox className="h-16 w-16 text-zinc-700" />
        <div className="absolute inset-0 rounded-full bg-violet-500/5 blur-xl" />
      </div>
      <p className="font-mono text-sm text-zinc-500 tracking-wider mb-1">
        {hasAny ? '当前过滤下没有探索' : '知识库尚未沉淀'}
      </p>
      <p className="text-xs text-zinc-600 max-w-xs mb-6">
        {hasAny
          ? '换个过滤条件，或开启新的探索。'
          : '从收藏图谱选一个节点作为起点，或直接输入一个实体，开启追问式探索后即可存档至此。'}
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs text-violet-300 hover:bg-violet-500/20 transition-colors font-mono tracking-wider"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        开启探索
      </button>
    </div>
  );
}

// ===== 文件夹卡片网格 =====

interface SessionGridProps {
  sessions: ExpSession[];
  editingId: string | null;
  editingTitle: string;
  confirmDeleteId: string | null;
  onOpen: (s: ExpSession) => void;
  onRenameStart: (s: ExpSession) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onToggleArchive: (s: ExpSession) => void;
  onDeleteRequest: (id: string) => void;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
}

function SessionGrid(props: SessionGridProps) {
  const { sessions } = props;
  return (
    <div className="relative">
      {/* 文件架装饰 */}
      <div className="flex items-center gap-2 px-1 pb-4">
        <FolderOpen className="h-3 w-3 text-zinc-600" />
        <span className="text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
          VAULT · 探索档案
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-zinc-700/40 to-transparent" />
        <span className="text-[9px] font-mono text-zinc-700">{sessions.length} 份</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sessions.map((s, i) => (
          <SessionCard key={s.id} session={s} index={i} {...props} />
        ))}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  index,
  editingId,
  editingTitle,
  confirmDeleteId,
  onOpen,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onToggleArchive,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: SessionGridProps & { session: ExpSession; index: number }) {
  const isEditing = editingId === session.id;
  const isConfirmingDelete = confirmDeleteId === session.id;
  const isArchived = session.status === 'archived';

  // 种子来源标签
  const fromGraph = session.seedFrom === 'graph_node';

  return (
    <div
      className="group relative animate-fade-in"
      style={{
        animationDelay: `${index * 40}ms`,
      }}
    >
      {/* 文件夹顶部翻页装饰 */}
      <div className="absolute -top-2 left-3 right-3 h-2 rounded-t-md bg-gradient-to-b from-violet-500/15 to-transparent border-x border-t border-violet-500/15" />

      {/* 卡片主体 */}
      <div
        className={cn(
          'relative rounded-lg border bg-zinc-950/60 p-3 pt-4 transition-all',
          'shadow-[0_4px_12px_rgba(0,0,0,0.3)]',
          isArchived
            ? 'border-white/[0.05] hover:border-white/[0.1]'
            : 'border-violet-500/15 hover:border-violet-500/30 hover:shadow-[0_6px_20px_rgba(139,92,246,0.15)]',
        )}
      >
        {/* 状态条 + 操作 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-mono tracking-wider uppercase',
                isArchived
                  ? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                  : 'bg-violet-500/10 text-violet-300 border border-violet-500/25',
              )}
            >
              <Circle className="h-1.5 w-1.5" />
              {isArchived ? '已存档' : '进行中'}
            </span>
            {fromGraph && (
              <span className="text-[8px] font-mono text-zinc-600 border border-white/[0.06] rounded px-1 py-0.5">
                导入自图谱
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {!isEditing && !isConfirmingDelete && (
              <>
                <IconButton title="改名" onClick={() => onRenameStart(session)}>
                  <Pencil className="h-3 w-3" />
                </IconButton>
                <IconButton
                  title={isArchived ? '重新激活' : '存入知识库'}
                  onClick={() => onToggleArchive(session)}
                >
                  {isArchived ? <RotateCcw className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                </IconButton>
                <IconButton title="删除" danger onClick={() => onDeleteRequest(session.id)}>
                  <Trash2 className="h-3 w-3" />
                </IconButton>
              </>
            )}
          </div>
        </div>

        {/* 标题（可编辑） */}
        {isEditing ? (
          <div className="flex items-center gap-1 mb-1.5">
            <input
              autoFocus
              type="text"
              value={editingTitle}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameCommit();
                if (e.key === 'Escape') onRenameCancel();
              }}
              className="flex-1 rounded border border-violet-500/40 bg-zinc-900/80 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-violet-500/60"
            />
            <IconButton title="确认" onClick={onRenameCommit}>
              <Check className="h-3 w-3 text-emerald-400" />
            </IconButton>
            <IconButton title="取消" onClick={onRenameCancel}>
              <X className="h-3 w-3" />
            </IconButton>
          </div>
        ) : (
          <h3
            onClick={() => onOpen(session)}
            className={cn(
              'text-sm text-zinc-100 font-medium mb-1 truncate cursor-pointer hover:text-violet-200 transition-colors',
              isArchived && 'text-zinc-300',
            )}
            title={session.title}
          >
            {session.title}
          </h3>
        )}

        {/* 种子实体 */}
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-2">
          <Network className="h-3 w-3 text-violet-400/60 shrink-0" />
          <span className="truncate" title={session.seedLabel}>
            种子 · {session.seedLabel}
          </span>
        </div>

        {/* 统计 */}
        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600">
          <span className="flex items-center gap-1">
            <Circle className="h-2 w-2 text-emerald-400/70" />
            {session.nodeCount} 节点
          </span>
          <span className="flex items-center gap-1">
            <Share2 className="h-2.5 w-2.5 text-violet-400/70" />
            {session.stepCount} 步
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <Clock className="h-2.5 w-2.5" />
            {session.updatedAt?.slice(0, 10)}
          </span>
        </div>

        {/* 删除确认条 */}
        {isConfirmingDelete && (
          <div className="mt-2 pt-2 border-t border-rose-500/15 flex items-center gap-2">
            <span className="text-[10px] text-rose-300/80 flex-1">删除后无法恢复</span>
            <button
              onClick={() => onDeleteConfirm(session.id)}
              className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/25 transition-colors font-mono"
            >
              确认
            </button>
            <button
              onClick={onDeleteCancel}
              className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-white/5 transition-colors font-mono"
            >
              取消
            </button>
          </div>
        )}

        {/* 打开按钮 */}
        {!isEditing && !isConfirmingDelete && (
          <button
            onClick={() => onOpen(session)}
            className="mt-2 w-full rounded border border-white/[0.06] bg-white/[0.02] py-1 text-[10px] font-mono text-zinc-400 tracking-wider hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-200 transition-all uppercase"
          >
            {isArchived ? '回看图谱' : '继续探索 →'}
          </button>
        )}
      </div>
    </div>
  );
}

// ===== 图标按钮 =====

function IconButton({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors',
        danger
          ? 'hover:text-rose-400 hover:bg-rose-500/10'
          : 'hover:text-zinc-200 hover:bg-white/5',
      )}
    >
      {children}
    </button>
  );
}

import { useState, useEffect, useCallback } from 'react';
import {
  X, FolderOpen, FolderPlus, Inbox, Check, Loader2, AlertCircle, FolderInput,
} from 'lucide-react';
import { useAuthStore, authFetch } from '@/store/auth';
import { cn } from '@/lib/utils';
import type { FolderSummary } from '@/lib/cardMeta';

interface FolderSelectDialogProps {
  onClose: () => void;
  /** null = 未分类 */
  onConfirm: (folderId: string | null) => void;
}

/**
 * 文件夹选择弹窗 — 收藏卡片时选择归档目标
 *
 * 设计语言：档案抽屉 + cyan 辉光（与 Library 页面一致）
 *   - 列出"未分类" + 各 folder（每条显示卡片数）
 *   - 顶部"＋新建文件夹" → 折叠输入框 → 回车创建 → 自动选中
 *   - 默认选中"未分类"，ESC 关闭
 */
export default function FolderSelectDialog({ onClose, onConfirm }: FolderSelectDialogProps) {
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null); // null = 未分类
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载文件夹列表
  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/folders');
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 创建新文件夹
  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creatingLoading) return;
    setCreatingLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFolders((prev) => [...prev, data.folder]);
        setSelectedId(data.folder.id);
        setNewName('');
        setCreating(false);
      } else {
        setError(data.error || '创建失败');
      }
    } catch {
      setError('网络异常，请重试');
    } finally {
      setCreatingLoading(false);
    }
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    } else if (e.key === 'Escape') {
      setCreating(false);
      setNewName('');
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
      {/* 遮罩 */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md animate-fade-in"
      />

      {/* 弹窗主体 */}
      <div className="relative w-full max-w-md animate-auth-dialog-in">
        <div className="dossier-card corner-brackets rounded-2xl border border-cyan-500/20 bg-zinc-950/95 backdrop-blur-xl shadow-[0_0_60px_rgba(6,182,212,0.1)]">
          {/* 顶部标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <FolderInput className="h-4 w-4 text-cyan-400" />
              <h2 className="font-mono text-sm tracking-[0.25em] text-zinc-200 uppercase">
                归档至
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/5 text-zinc-500 transition-colors hover:text-zinc-200 hover:border-white/15"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 副标题 */}
          <div className="px-6 pt-4 pb-2">
            <p className="text-[11px] font-mono text-zinc-600 tracking-wider">
              ARCHIVE TARGET · 选择文件夹归档此卡片
            </p>
          </div>

          {/* 列表区 */}
          <div className="px-6 pb-3 pt-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                {/* 未分类 */}
                <FolderRow
                  icon={<Inbox className="h-3.5 w-3.5" />}
                  label="未分类"
                  count={null}
                  active={selectedId === null}
                  onClick={() => setSelectedId(null)}
                />

                {folders.length > 0 && (
                  <div className="h-px bg-white/[0.04] my-1.5" />
                )}

                {folders.map((f) => (
                  <FolderRow
                    key={f.id}
                    icon={<FolderOpen className="h-3.5 w-3.5" />}
                    label={f.name}
                    count={f.itemCount}
                    hasGraph={!!f.graph}
                    active={selectedId === f.id}
                    onClick={() => setSelectedId(f.id)}
                  />
                ))}

                {/* 新建文件夹输入框 */}
                {creating && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.04] px-3 py-2 animate-fade-in">
                    <FolderPlus className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={handleCreateKeyDown}
                      placeholder="新文件夹名称..."
                      className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 font-mono outline-none tracking-wider"
                    />
                    {creatingLoading ? (
                      <Loader2 className="h-3.5 w-3.5 text-cyan-400 animate-spin shrink-0" />
                    ) : (
                      <button
                        onClick={handleCreate}
                        disabled={!newName.trim()}
                        className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-cyan-400 hover:bg-cyan-500/15 transition-colors disabled:opacity-30"
                        title="确认创建"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.04] px-3 py-2 text-xs text-rose-300 animate-fade-in">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* 底部操作区 */}
          <div className="px-6 pb-5 pt-2 border-t border-white/[0.04]">
            {/* 新建文件夹按钮 */}
            {!creating && !loading && (
              <button
                type="button"
                onClick={() => {
                  setCreating(true);
                  setNewName('');
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/10 py-1.5 text-[11px] font-mono text-zinc-500 hover:text-cyan-300 hover:border-cyan-500/30 transition-colors tracking-wider uppercase mb-2"
              >
                <FolderPlus className="h-3 w-3" />
                新建文件夹
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-xs font-mono text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors tracking-wider uppercase"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => onConfirm(selectedId)}
                className="flex-[2] flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-mono text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all tracking-wider uppercase"
              >
                <FolderInput className="h-3.5 w-3.5" />
                确认归档
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== 文件夹行项 =====

function FolderRow({
  icon,
  label,
  count,
  hasGraph,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number | null;
  hasGraph?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all text-left',
        active
          ? 'border-cyan-500/40 bg-cyan-500/10 shadow-[0_0_16px_rgba(6,182,212,0.12)]'
          : 'border-white/[0.04] hover:border-white/10 hover:bg-white/[0.02]',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-cyan-300' : 'text-zinc-500')}>{icon}</span>
      <span className={cn('flex-1 truncate text-xs', active ? 'text-zinc-100' : 'text-zinc-300')}>
        {label}
      </span>
      {hasGraph && (
        <span
          className="shrink-0 h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.6)]"
          title="已生成知识图谱"
        />
      )}
      {count !== null && (
        <span className="shrink-0 text-[10px] font-mono text-zinc-600">{count}</span>
      )}
      {active && <Check className="h-3.5 w-3.5 text-cyan-300 shrink-0" />}
    </button>
  );
}

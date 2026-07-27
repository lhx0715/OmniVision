import { useState } from 'react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import { useAuthStore, authFetch } from '@/store/auth';
import { cn } from '@/lib/utils';
import type { CardType, CardData } from '@/types';
import FolderSelectDialog from './FolderSelectDialog';

interface SaveToLibraryButtonProps {
  cardType: CardType;
  cardPayload: CardData;
}

/**
 * 卡片收藏按钮 — 存入知识库
 *
 * 行为：
 *   - 未登录 → 触发登录引导（通过 store 状态）
 *   - 已登录 → 弹出文件夹选择弹窗 → 选择/新建文件夹 → POST /api/library（带 folderId）
 *   - 防重复：按 cardType + 当前 query 去重（前端 status 标记）
 */
export default function SaveToLibraryButton({ cardType, cardPayload }: SaveToLibraryButtonProps) {
  const query = useOmniVisionStore((s) => s.query);
  const entityType = useOmniVisionStore((s) => s.entityType);
  const authUser = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = async () => {
    if (!authUser) {
      // 未登录 → 触发全局登录弹窗
      window.dispatchEvent(new CustomEvent('omnivision:auth-required'));
      return;
    }
    setDialogOpen(true);
  };

  const handleConfirm = async (folderId: string | null) => {
    setDialogOpen(false);
    setStatus('saving');
    try {
      const res = await authFetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceQuery: query,
          entityName: query,
          entityType,
          cardType,
          cardPayload,
          folderId,
        }),
      });

      if (res.ok) {
        setStatus('saved');
      } else {
        const data = await res.json().catch(() => ({}));
        console.warn('[save] 收藏失败:', data.error);
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  };

  const isSaved = status === 'saved';
  const isSaving = status === 'saving';

  return (
    <>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaved || isSaving}
        title={isSaved ? '已存入知识库' : '存入知识库'}
        aria-label={isSaved ? '已存入知识库' : '存入知识库'}
        className={cn(
          'group/btn absolute top-2 right-2 z-30',
          'flex h-7 w-7 items-center justify-center rounded-md border transition-all',
          isSaved
            ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
            : 'border-white/[0.06] bg-zinc-950/60 text-zinc-500 backdrop-blur-sm',
          !isSaved && !isSaving && 'hover:border-cyan-500/30 hover:text-cyan-400 hover:bg-cyan-500/10',
          isSaving && 'opacity-60 cursor-wait',
        )}
      >
        {isSaving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isSaved ? (
          <BookmarkCheck className="h-3.5 w-3.5" />
        ) : (
          <Bookmark className="h-3.5 w-3.5" />
        )}
        {/* 收藏成功动画 */}
        {isSaved && (
          <span className="absolute inset-0 rounded-md border border-cyan-400/60 animate-ping" style={{ animationDuration: '0.8s' }} />
        )}
      </button>

      {/* 文件夹选择弹窗 */}
      {dialogOpen && (
        <FolderSelectDialog
          onClose={() => setDialogOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}

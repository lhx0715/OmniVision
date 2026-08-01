/**
 * 图谱导出弹窗 — 探索页面
 *
 * 将 ReactFlow 渲染的完整图谱导出为 PNG 位图 / SVG 矢量图。
 * 导出前自动 fitView 确保所有节点可见；截图目标锁定 .react-flow 子元素，
 * 以排除回溯滑块、底部提示等兄弟 UI；再通过 filter 移除 Controls/MiniMap/水印。
 *
 * 设计语言：档案卡片 + violet 辉光（与 Explore 页面一致）
 */
import { useState, useEffect } from 'react';
import { toPng, toSvg } from 'html-to-image';
import {
  X, Download, Image as ImageIcon, FileType, ChevronRight, Loader2, AlertCircle,
} from 'lucide-react';
import type { useReactFlow } from 'reactflow';

type ReactFlowInstance = ReturnType<typeof useReactFlow>;

interface ExportGraphDialogProps {
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  reactFlow: ReactFlowInstance;
  sessionTitle: string;
}

type ExportFormat = 'png' | 'svg';

export default function ExportGraphDialog({
  onClose,
  containerRef,
  reactFlow,
  sessionTitle,
}: ExportGraphDialogProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, loading]);

  const handleExport = async (format: ExportFormat) => {
    if (loading) return;
    setLoading(format);
    setError(null);

    try {
      // 1. fitView 确保完整图谱可见
      reactFlow.fitView({ padding: 0.2 });

      // 2. 等待视口/布局稳定（fitView 重算 transform 后 DOM 需一帧渲染）
      await new Promise((r) => setTimeout(r, 350));

      // 3. 定位截图目标：.react-flow 子元素，自动排除回溯滑块/底部提示等兄弟
      const target = containerRef.current?.querySelector('.react-flow') as HTMLElement | null;
      if (!target) {
        throw new Error('未找到图谱元素');
      }

      // 4. filter 排除 Controls / MiniMap / 水印
      const filter = (node: HTMLElement) => {
        if (!node?.classList) return true;
        return (
          !node.classList.contains('react-flow__controls') &&
          !node.classList.contains('react-flow__minimap') &&
          !node.classList.contains('react-flow__attribution')
        );
      };

      // 5. 调用 html-to-image 生成 dataUrl
      const dataUrl =
        format === 'png'
          ? await toPng(target, { backgroundColor: '#0a0a0b', pixelRatio: 2, filter })
          : await toSvg(target, { backgroundColor: '#0a0a0b', filter });

      // 6. 触发下载
      const ts = new Date();
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(
        ts.getDate(),
      ).padStart(2, '0')}-${String(ts.getHours()).padStart(2, '0')}${String(
        ts.getMinutes(),
      ).padStart(2, '0')}`;
      const safeTitle = sessionTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || '未命名';
      const filename = `探索图谱_${safeTitle}_${stamp}.${format}`;

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      a.click();

      // 7. 关闭弹窗
      setLoading(null);
      onClose();
    } catch (err) {
      console.error('[ExportGraphDialog] export failed:', err);
      setError('导出失败，请重试');
      setLoading(null);
    }
  };

  const busy = loading !== null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
      {/* 遮罩 */}
      <div
        onClick={() => !busy && onClose()}
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md animate-fade-in"
      />

      {/* 弹窗主体 */}
      <div className="relative w-full max-w-md animate-auth-dialog-in">
        <div className="dossier-card corner-brackets rounded-2xl border border-violet-500/20 bg-zinc-950/95 backdrop-blur-xl shadow-[0_0_60px_rgba(139,92,246,0.1)]">
          {/* 顶部标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <Download className="h-4 w-4 text-violet-400" />
              <h2 className="font-mono text-sm tracking-[0.25em] text-zinc-200 uppercase">
                导出图谱
              </h2>
            </div>
            <button
              type="button"
              onClick={() => !busy && onClose()}
              disabled={busy}
              aria-label="关闭"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/5 text-zinc-500 transition-colors hover:text-zinc-200 hover:border-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 副标题 */}
          <div className="px-6 pt-4 pb-2">
            <p className="text-[11px] font-mono text-zinc-600 tracking-wider">
              EXPORT FORMAT · 选择导出格式，将自动截取完整图谱
            </p>
          </div>

          {/* 选项区 */}
          <div className="px-6 pb-3 pt-2">
            <div className="space-y-2">
              {/* PNG 位图 */}
              <button
                type="button"
                onClick={() => handleExport('png')}
                disabled={busy}
                className="w-full flex items-center gap-3 rounded-lg border border-white/[0.04] hover:border-violet-500/30 hover:bg-violet-500/[0.04] transition-all px-4 py-3 text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-white/[0.04] disabled:hover:bg-transparent"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-violet-500/20 bg-violet-500/[0.06]">
                  {loading === 'png' ? (
                    <Loader2 className="h-4 w-4 text-violet-300 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-violet-300" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-mono text-zinc-100 tracking-wider">
                    PNG 位图
                  </span>
                  <span className="block text-[10px] font-mono text-zinc-600 tracking-wide mt-0.5">
                    高清位图 · 适合分享到聊天/文档
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-700 shrink-0" />
              </button>

              {/* SVG 矢量图 */}
              <button
                type="button"
                onClick={() => handleExport('svg')}
                disabled={busy}
                className="w-full flex items-center gap-3 rounded-lg border border-white/[0.04] hover:border-violet-500/30 hover:bg-violet-500/[0.04] transition-all px-4 py-3 text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-white/[0.04] disabled:hover:bg-transparent"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-violet-500/20 bg-violet-500/[0.06]">
                  {loading === 'svg' ? (
                    <Loader2 className="h-4 w-4 text-violet-300 animate-spin" />
                  ) : (
                    <FileType className="h-4 w-4 text-violet-300" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-mono text-zinc-100 tracking-wider">
                    SVG 矢量图
                  </span>
                  <span className="block text-[10px] font-mono text-zinc-600 tracking-wide mt-0.5">
                    矢量无限缩放 · 适合打印/PPT
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-700 shrink-0" />
              </button>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.04] px-3 py-2 text-xs text-rose-300 animate-fade-in">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* 底部操作区 */}
          <div className="px-6 pb-5 pt-2 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={() => !busy && onClose()}
              disabled={busy}
              className="w-full rounded-lg border border-white/10 px-4 py-2 text-xs font-mono text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors tracking-wider uppercase disabled:opacity-40 disabled:cursor-not-allowed"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

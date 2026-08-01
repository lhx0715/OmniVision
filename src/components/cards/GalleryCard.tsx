import { useCallback, useEffect, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Maximize2, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GalleryCardProps {
  images: string[];
}

// 缩略图网格最多展示 9 张（3×3），其余通过 lightbox 查看
const MAX_THUMBNAILS = 9;

/**
 * 主动验证图片能否加载（避免显示 broken image）
 * 返回 Promise<boolean>：true = 可加载，false = 失败
 */
function verifyImage(src: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    // data: 或 blob: URL 默认可用，跳过网络探测
    if (src.startsWith('data:') || src.startsWith('blob:')) {
      resolve(true);
      return;
    }
    const img = new Image();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
    };
    img.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(true);
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    };
    img.src = src;
  });
}

export default function GalleryCard({ images }: GalleryCardProps) {
  // 图片验证状态：null = 验证中，true = 通过，false = 失败
  const [verifyMap, setVerifyMap] = useState<Map<number, boolean>>(new Map());
  const [verifying, setVerifying] = useState(true);
  const verifyRunningRef = useRef(false);

  // 对每张图片做预加载验证（images 变化时重新验证）
  useEffect(() => {
    if (!images || images.length === 0) {
      setVerifying(false);
      setVerifyMap(new Map());
      return;
    }
    if (verifyRunningRef.current) return;
    verifyRunningRef.current = true;
    setVerifying(true);

    let cancelled = false;
    const nextMap = new Map<number, boolean>();

    (async () => {
      // 并发验证，限制最大并发数为 6
      const concurrency = 6;
      const queue = images.map((src, i) => ({ src, i }));
      const workers: Promise<void>[] = [];
      for (let w = 0; w < concurrency && queue.length > 0; w++) {
        const worker = (async () => {
          while (queue.length > 0) {
            const task = queue.shift()!;
            const ok = await verifyImage(task.src);
            if (cancelled) return;
            nextMap.set(task.i, ok);
            // 增量更新 UI，让验证通过的图尽早出现
            setVerifyMap(new Map(nextMap));
          }
        })();
        workers.push(worker);
      }
      await Promise.all(workers);
      if (!cancelled) {
        setVerifyMap(new Map(nextMap));
        setVerifying(false);
      }
      verifyRunningRef.current = false;
    })();

    return () => {
      cancelled = true;
      verifyRunningRef.current = false;
    };
  }, [images]);

  // 基于验证结果，筛选出有效图片，并保持原顺序
  const validImages = (images || []).filter((_, i) => verifyMap.get(i) === true);

  const thumbnails = validImages.slice(0, MAX_THUMBNAILS);
  const hiddenCount = Math.max(0, validImages.length - MAX_THUMBNAILS);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const isLightboxOpen = lightboxIndex !== null;

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const showPrev = useCallback(() => {
    setLightboxIndex((cur) => {
      if (cur === null) return cur;
      return (cur - 1 + validImages.length) % validImages.length;
    });
  }, [validImages.length]);

  const showNext = useCallback(() => {
    setLightboxIndex((cur) => {
      if (cur === null) return cur;
      return (cur + 1) % validImages.length;
    });
  }, [validImages.length]);

  // lightbox 打开时：锁定滚动 + 键盘导航（Esc 关闭 / ← → 切换）
  useEffect(() => {
    if (!isLightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        showPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        showNext();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isLightboxOpen, closeLightbox, showPrev, showNext]);

  // 没有有效图片（且验证完毕）时不渲染
  if (!verifying && validImages.length === 0) return null;

  // 验证中的加载骨架位（防止 empty → 突然出现的闪烁；也让用户感知正在筛图）
  const showSkeleton = verifying && thumbnails.length === 0;
  const skeletonSlots = Math.min(MAX_THUMBNAILS, (images || []).length || 9);

  return (
    <>
      <div
        className={cn(
          'dossier-card corner-brackets rounded-2xl border border-violet-500/15 p-6 h-full flex flex-col relative overflow-hidden',
          'hover:border-violet-500/40 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-violet-500/10',
        )}
      >
        {/* 背景大编号 */}
        <span
          className="bg-number text-violet-500"
          style={{ top: '-1rem', right: '0.5rem' }}
        >
          07
        </span>

        {/* 头部 */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="pulse-dot amber inline-block h-2 w-2 rounded-full bg-violet-400" />
            <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-violet-400/90">
              Imagery
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Maximize2 className="h-3 w-3 text-violet-300/60" />
            <span className="classification-stamp text-violet-400 border-violet-500/30">
              Intel // Imagery
            </span>
          </div>
        </div>

        <div className="relative z-10 mt-1 flex items-center justify-between">
          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            影像档案 · {validImages.length} 张影像
            {verifying && (
              <span className="ml-2 inline-flex items-center gap-1 text-violet-400/70">
                <Loader2 className="h-3 w-3 animate-spin" />
                筛选中
              </span>
            )}
          </div>
        </div>

        {/* 标题 */}
        <h3 className="relative z-10 mt-2 text-base font-semibold text-zinc-100">
          影像档案
        </h3>

        {/* 3×3 缩略图网格 */}
        <div className="relative z-10 mt-3 grid grid-cols-3 gap-1.5 flex-1 min-h-[180px]">
          {/* 验证中：显示骨架位，或已通过验证的图 */}
          {showSkeleton
            ? Array.from({ length: skeletonSlots }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="aspect-square overflow-hidden rounded-md border border-violet-500/10 bg-zinc-900/60 skeleton-shimmer"
                />
              ))
            : thumbnails.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  title={`查看第 ${i + 1} 张影像`}
                  className="group relative aspect-square overflow-hidden rounded-md border border-violet-500/15 bg-zinc-900/60 transition-all hover:border-violet-400/60 hover:ring-1 hover:ring-violet-400/40"
                >
                  <img
                    src={src}
                    alt={`影像 ${i + 1}`}
                    loading="lazy"
                    // 兜底 onError：极端情况下再次捕获失败（例如预加载时命中缓存，但 CDN 切换导致）
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* 悬浮遮罩 + 角标 */}
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  {/* 第 9 张若有更多图片，显示 +N */}
                  {i === MAX_THUMBNAILS - 1 && hiddenCount > 0 && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-950/70 text-sm font-mono font-semibold text-violet-200">
                      +{hiddenCount}
                    </span>
                  )}
                </button>
              ))}
        </div>

        {/* 底部说明 */}
        <div className="relative z-10 mt-3 pt-3 border-t border-violet-500/10 flex items-center justify-between">
          <span className="text-[9px] font-mono uppercase tracking-widest text-violet-400/70">
            点击缩略图放大查看
          </span>
          <span className="text-[9px] font-mono text-zinc-500">
            {validImages.length} PHOTOS
          </span>
        </div>
      </div>

      {/* Lightbox 全屏查看 */}
      {isLightboxOpen && lightboxIndex !== null && validImages[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm animate-fade-in"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="影像放大查看"
        >
          {/* 关闭按钮 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            title="关闭 (Esc)"
            className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-900/80 text-zinc-300 transition-colors hover:border-violet-400/60 hover:text-violet-200"
          >
            <X className="h-5 w-5" />
          </button>

          {/* 计数器 */}
          <span className="absolute top-6 left-1/2 -translate-x-1/2 z-10 rounded-full border border-zinc-700/60 bg-zinc-900/80 px-3 py-1 text-[11px] font-mono text-zinc-300">
            {lightboxIndex + 1} / {validImages.length}
          </span>

          {/* 上一张 */}
          {validImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                showPrev();
              }}
              title="上一张 (←)"
              className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-900/80 text-zinc-300 transition-colors hover:border-violet-400/60 hover:text-violet-200"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* 大图 */}
          <img
            src={validImages[lightboxIndex]}
            alt={`影像 ${lightboxIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
            }}
            className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl shadow-violet-500/10 ring-1 ring-violet-500/20"
          />

          {/* 下一张 */}
          {validImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                showNext();
              }}
              title="下一张 (→)"
              className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-900/80 text-zinc-300 transition-colors hover:border-violet-400/60 hover:text-violet-200"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* 空状态兜底（当前图加载失败且无图可显示） */}
          {validImages.length === 0 && (
            <div className="flex flex-col items-center gap-3 text-zinc-500">
              <ImageIcon className="h-10 w-10" />
              <span className="text-sm font-mono">影像加载失败</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
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
    if (typeof src === 'string' && (src.startsWith('data:') || src.startsWith('blob:'))) {
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

/**
 * 生成一个轻量级签名：判断 images 是否真正变更（引用/内容变化）。
 * 用于解决 verifyRunningRef 吞掉后续 SSE 追加图片的问题。
 */
function sigOf(arr: string[]): string {
  if (!arr || arr.length === 0) return '';
  if (arr.length <= 5) return `${arr.length}:${arr.join('|').slice(0, 200)}`;
  return `${arr.length}:${arr[0]}|${arr[1]}|…|${arr[arr.length - 1]}`;
}

export default function GalleryCard({ images }: GalleryCardProps) {
  const safeImages = useMemo(() => (Array.isArray(images) ? images : []), [images]);

  // 验证结果 Map：原始 images 数组的 index -> true/false
  const [verifyMap, setVerifyMap] = useState<Map<number, boolean>>(new Map());
  // 运行时 onError 捕获的失败 src（兜底：极端情况下预验证通过但实际 <img> 加载失败，如 CDN 切换）
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(new Set());
  const [verifying, setVerifying] = useState(true);

  // 用签名追踪批次，允许批次变更时重入验证（防止之前的 verifyRunningRef 吞更新）
  const currentSig = useMemo(() => sigOf(safeImages), [safeImages]);
  const activeSigRef = useRef<string>('');
  const activeBatchRef = useRef<Set<number>>(new Set());

  // 对每张图片做预加载验证（images 签名变化时重新验证未验证的 index）
  useEffect(() => {
    const sig = currentSig;
    if (!sig) {
      setVerifying(false);
      setVerifyMap(new Map());
      return;
    }

    setVerifying(true);
    // 新批次时清理过时批次的未完成项
    if (activeSigRef.current !== sig) {
      activeSigRef.current = sig;
      activeBatchRef.current = new Set();
    }

    let cancelled = false;
    // 找出需要验证的 index（本批次没在跑的，且 verifyMap 里还没结果的）
    const pendingIdx: number[] = [];
    safeImages.forEach((src, i) => {
      if (verifyMap.has(i)) return; // 已有结果跳过
      if (activeBatchRef.current.has(i)) return; // 本批次已在跑
      pendingIdx.push(i);
      activeBatchRef.current.add(i);
    });

    if (pendingIdx.length === 0) {
      // 无新增待验证，保留 verifying（直到所有已经在跑的 settle）— 这里简单处理直接关掉 verifying
      setVerifying(false);
      return;
    }

    (async () => {
      const concurrency = 6;
      const queue = pendingIdx.slice();
      const workers: Promise<void>[] = [];
      const patchMap = new Map<number, boolean>();
      // 启动并发 worker
      const spawnWorker = () =>
        (async () => {
          while (queue.length > 0) {
            const idx = queue.shift()!;
            const src = safeImages[idx];
            // eslint-disable-next-line no-await-in-loop
            const ok = await verifyImage(src);
            if (cancelled) return;
            // 只接受当前批次的结果（防止旧批次结果回写污染）
            if (activeSigRef.current !== sig) continue;
            patchMap.set(idx, ok);
            // 增量刷新 UI：一张一张推进
            setVerifyMap((prev) => {
              const next = new Map(prev);
              for (const [k, v] of patchMap) next.set(k, v);
              return next;
            });
          }
        })();

      for (let w = 0; w < concurrency && workers.length < queue.length + workers.length; w++) {
        workers.push(spawnWorker());
      }
      await Promise.all(workers);
      if (!cancelled && activeSigRef.current === sig) {
        setVerifying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSig]);

  // 有效图片 = 预验证通过 且 运行时未出现失败
  const validImages = useMemo(
    () =>
      safeImages.filter(
        (src, i) => verifyMap.get(i) === true && !failedSrcs.has(src),
      ),
    [safeImages, verifyMap, failedSrcs],
  );

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

  // 记录运行时加载失败的 src（兜底：预验证通过但实际渲染失败）
  const handleRuntimeError = useCallback((src: string) => {
    setFailedSrcs((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  }, []);

  // 没有有效图片（且验证完毕）时不渲染
  if (!verifying && validImages.length === 0) return null;

  // 验证中的加载骨架位（防止 empty → 突然出现的闪烁；也让用户感知正在筛图）
  const showSkeleton = verifying && thumbnails.length === 0;
  const skeletonSlots = Math.min(MAX_THUMBNAILS, safeImages.length || 9);

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
                    onError={(e) => {
                      const el = e.currentTarget;
                      // 双重兜底：隐藏自己 + 同步到 failedSrcs，后续渲染直接剔除
                      el.style.display = 'none';
                      handleRuntimeError(src);
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
              const el = e.currentTarget;
              el.style.display = 'none';
              handleRuntimeError(validImages[lightboxIndex] ?? '');
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

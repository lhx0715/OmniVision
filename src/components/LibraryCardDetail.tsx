import { useState, useEffect, useCallback } from 'react';
import { X, FileText, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  CardType,
  CardData,
  VerdictCardData,
  TimelineCardData,
  AchievementsCardData,
  DarksideCardData,
  GameplayCardData,
  TrendCardData,
} from '@/types';
import type { KnowledgeItem } from '@/lib/cardMeta';
import { CARD_META, ENTITY_LABELS } from '@/lib/cardMeta';
import VerdictCard from './cards/VerdictCard';
import TimelineCard from './cards/TimelineCard';
import AchievementsCard from './cards/AchievementsCard';
import DarksideCard from './cards/DarksideCard';
import GameplayCard from './cards/GameplayCard';
import TrendCard from './cards/TrendCard';

// 各卡片在 BentoGrid 中的原始列宽（src/components/BentoGrid.tsx:47-54）决定详情层最大宽度
const MAX_WIDTH_BY_CARD_TYPE: Record<CardType, string> = {
  verdict: 'max-w-5xl',
  timeline: 'max-w-2xl',
  achievements: 'max-w-4xl',
  trends: 'max-w-4xl',
  darkside: 'max-w-3xl',
  gameplay: 'max-w-3xl',
};

/**
 * 卡片分发 — 照搬 BentoGrid renderCard 范式（src/components/BentoGrid.tsx:67-84）
 * 回看场景不传 onTagClick，VerdictCard 标签自动降级为只读徽章（VerdictCard.tsx:121 disabled={!onTagClick}）
 */
function renderCard(type: CardType, data: CardData) {
  switch (type) {
    case 'verdict':
      return <VerdictCard data={data as VerdictCardData} />;
    case 'timeline':
      return <TimelineCard data={data as TimelineCardData} />;
    case 'achievements':
      return <AchievementsCard data={data as AchievementsCardData} />;
    case 'darkside':
      return <DarksideCard data={data as DarksideCardData} />;
    case 'gameplay':
      return <GameplayCard data={data as GameplayCardData} />;
    case 'trends':
      return <TrendCard data={data as TrendCardData} />;
    default:
      return null;
  }
}

interface LibraryCardDetailProps {
  item: KnowledgeItem;
  onClose: () => void;
}

/**
 * 知识库卡片回看层 — 全屏覆盖
 *
 * 点击知识库条目后弹出，按 cardType 复用对应卡片组件 1:1 复现原始卡片完整内容。
 * 复用 ArchiveUnsealTransition 的 z-[100]/backdrop-blur/角标/scan-line 档案风格，
 * 复用 GalleryCard 的 ESC + 遮罩点击 + body 滚动锁定关闭机制。
 */
export default function LibraryCardDetail({ item, onClose }: LibraryCardDetailProps) {
  const [fadingOut, setFadingOut] = useState(false);
  const meta = CARD_META[item.cardType];

  // 退出动画后再卸载，给淡出过渡留时间（明确退出路径，不会卡住）
  const handleClose = useCallback(() => {
    setFadingOut(true);
    setTimeout(onClose, 280);
  }, [onClose]);

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // body 滚动锁定（复用 GalleryCard.tsx:54-58 范式）
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex flex-col overflow-hidden',
        'bg-zinc-950/80 backdrop-blur-md',
        'transition-opacity duration-300',
        fadingOut ? 'opacity-0' : 'opacity-100 animate-fade-in',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={`档案回看: ${item.entityName}`}
    >
      {/* 背景层 — 档案库质感（复用 ArchiveUnsealTransition 的 bg-grid / scan-line） */}
      <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
      <div className="absolute inset-0 scan-line opacity-20 pointer-events-none" />

      {/* 遮罩点击区 — 点空白关闭；内容容器是其兄弟节点，点卡片不会冒泡到此 */}
      <div className="absolute inset-0" onClick={handleClose} />

      {/* 内容容器 — 居中 + 可滚动 */}
      <div className="relative z-10 flex-1 flex items-start justify-center overflow-y-auto px-4 py-6 md:px-6 md:py-10">
        <div className={cn('w-full', MAX_WIDTH_BY_CARD_TYPE[item.cardType])}>
          <div className="relative">
            {/* 四角档案标记（复用 ArchiveUnsealTransition.tsx:259-262 风格，cyan 呼应知识库主色） */}
            <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-cyan-500/40 pointer-events-none" />
            <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-cyan-500/40 pointer-events-none" />
            <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-cyan-500/40 pointer-events-none" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-cyan-500/40 pointer-events-none" />

            {/* 档案头 */}
            <header className="relative flex items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.06] bg-zinc-950/60">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-cyan-400/80 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[9px] font-mono text-zinc-600 tracking-[0.3em] uppercase mb-0.5">
                    DOSSIER · {meta.label}
                  </div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base md:text-lg font-semibold text-zinc-100 truncate">
                      {item.entityName}
                    </h2>
                    {item.entityType && (
                      <span className="text-[9px] font-mono text-zinc-600 border border-white/[0.06] rounded px-1 py-0.5 shrink-0">
                        {ENTITY_LABELS[item.entityType] || item.entityType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex flex-col items-end text-[9px] font-mono text-zinc-600 leading-tight">
                  <span>SOURCE: {item.sourceQuery}</span>
                  <span>FILED: {new Date(item.savedAt).toLocaleString('zh-CN')}</span>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono tracking-wider uppercase',
                    `bg-${meta.color}-500/10 text-${meta.color}-400 border border-${meta.color}-500/20`,
                  )}
                >
                  {meta.label}
                </span>
                <button
                  type="button"
                  onClick={handleClose}
                  title="关闭 (ESC)"
                  aria-label="关闭"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.06] bg-zinc-950/60 text-zinc-400 hover:text-zinc-100 hover:border-white/20 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* 卡片渲染区 — 复用卡片组件，data 来自 item.cardPayload */}
            <div className="relative bg-zinc-950/40 p-4 md:p-6 min-h-[50vh]">
              {item.cardPayload ? (
                renderCard(item.cardType, item.cardPayload)
              ) : (
                <div className="py-12 text-center text-zinc-500 text-sm font-mono">
                  档案数据缺失
                </div>
              )}
            </div>

            {/* 档案脚注 */}
            <footer className="flex items-center justify-between px-5 py-2 border-t border-white/[0.06] bg-zinc-950/60 text-[9px] font-mono text-zinc-600 tracking-wider uppercase">
              <div className="flex items-center gap-2">
                <Lock className="h-3 w-3 text-emerald-500/40" />
                <span>DECRYPTED · ARCHIVE REVIEW</span>
              </div>
              <span>REF. {item.id.slice(0, 8).toUpperCase()}</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

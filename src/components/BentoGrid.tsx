import { useOmniVisionStore, type ViewMode } from '@/store/omnivision';
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
import SkeletonCard from './SkeletonCard';
import CardEnterWrapper from './CardEnterWrapper';
import VerdictCard from './cards/VerdictCard';
import TimelineCard from './cards/TimelineCard';
import AchievementsCard from './cards/AchievementsCard';
import DarksideCard from './cards/DarksideCard';
import GameplayCard from './cards/GameplayCard';
import TrendCard from './cards/TrendCard';
import GalleryCard from './cards/GalleryCard';

const DISPLAY_ORDER: CardType[] = [
  'verdict',
  'timeline',
  'achievements',
  'trends',
  'darkside',
  'gameplay',
];

// D3 多视角切换 — 每个视角可见的卡片类型
// trends 已在 DISPLAY_ORDER 中，但 LLM 可能不返回数据，渲染时若无 data 会被自动跳过
const VIEW_CARD_MAP: Record<ViewMode, CardType[]> = {
  all: ['verdict', 'timeline', 'achievements', 'darkside', 'gameplay', 'trends'],
  positive: ['verdict', 'timeline', 'achievements', 'trends'],
  critical: ['verdict', 'darkside', 'gameplay'],
  game: ['darkside', 'gameplay'],
};

// 非对称杂志式布局 — 6列网格
// Row 1: [verdict ×6]                            — 全宽档案头版
// Row 2: [timeline ×2 row-span-2] [ach ×4]       — 时间轴纵长 + 战绩宽幅
// Row 3: [timeline cont.        ] [trends ×4]    — 趋势折线宽幅
// Row 4: [darkside ×3] [gameplay ×3]             — 反面 + 博弈并排
const SPAN_CLASSES: Record<CardType, string> = {
  verdict: 'md:col-span-6',
  timeline: 'md:col-span-2 md:row-span-2',
  achievements: 'md:col-span-4',
  trends: 'md:col-span-4',
  darkside: 'md:col-span-3',
  gameplay: 'md:col-span-3',
};

interface BentoGridProps {
  /** 定性卡片标签点击回调（B2 标签关联搜索） */
  onTagClick?: (tag: string) => void;
  /** 外部卡片数据（对比模式覆盖，提供时优先于 store.cards） */
  cardsOverride?: Partial<Record<CardType, CardData>>;
  /** 外部流式状态（对比模式覆盖） */
  streamingOverride?: CardType[];
  /** 强调色（聚焦环） */
  accentColor?: 'emerald' | 'amber';
}

function renderCard(type: CardType, data: CardData, onTagClick?: (tag: string) => void) {
  switch (type) {
    case 'verdict':
      return <VerdictCard data={data as VerdictCardData} onTagClick={onTagClick} />;
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

export default function BentoGrid({
  onTagClick,
  cardsOverride,
  streamingOverride,
  accentColor = 'emerald',
}: BentoGridProps) {
  const storeCards = useOmniVisionStore((s) => s.cards);
  const phase = useOmniVisionStore((s) => s.phase);
  const focusedCardIndex = useOmniVisionStore((s) => s.focusedCardIndex);
  const viewMode = useOmniVisionStore((s) => s.viewMode);
  const images = useOmniVisionStore((s) => s.images);

  const cards = cardsOverride ?? storeCards;

  // 影像档案仅在主实体视图（非对比覆盖）且结果阶段展示
  const showGallery = !cardsOverride && phase === 'results' && images.length > 0;

  const isStreaming = (type: CardType): boolean => {
    if (streamingOverride) return streamingOverride.includes(type);
    return phase === 'searching';
  };

  const ringClass =
    accentColor === 'amber'
      ? 'ring-2 ring-amber-400/60 ring-offset-2 ring-offset-zinc-950 rounded-2xl scale-[1.02] z-10'
      : 'ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-zinc-950 rounded-2xl scale-[1.02] z-10';

  return (
    <div
      key={viewMode}
      className="grid grid-cols-1 md:grid-cols-6 gap-3 w-full auto-rows-[minmax(150px,auto)] md:auto-rows-[minmax(180px,auto)]"
    >
      {DISPLAY_ORDER.map((type, i) => {
        // D3 视角过滤：跳过当前视角不可见的卡片
        // 保留原始索引 i 以兼容 B5 键盘聚焦（focusedCardIndex 基于 DISPLAY_ORDER）
        if (!VIEW_CARD_MAP[viewMode].includes(type)) return null;
        const data = cards[type];
        const showSkeleton = isStreaming(type) && !data;
        if (!data && !showSkeleton) return null;
        const isFocused = focusedCardIndex === i;

        return (
          <div
            key={type}
            data-card-type={type}
            className={cn(
              'relative min-h-[180px] transition-all duration-300',
              SPAN_CLASSES[type],
              isFocused && ringClass,
            )}
          >
            {data ? (
              <CardEnterWrapper delay={i * 100}>
                {renderCard(type, data, onTagClick)}
              </CardEnterWrapper>
            ) : (
              <div
                className="animate-fade-in h-full"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <SkeletonCard cardType={type} />
              </div>
            )}
            {/* A3 卡片脉冲点 — results 阶段且有数据时显示 */}
            {phase === 'results' && data && (
              <span className="animate-card-pulse pointer-events-none absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
          </div>
        );
      })}

      {/* 影像档案 — 独立于 CardType 的图片网格，放在 gameplay 之后 */}
      {showGallery && (
        <div
          className="relative min-h-[180px] md:col-span-3 animate-fade-in"
          data-card-type="gallery"
        >
          <GalleryCard images={images} />
        </div>
      )}
    </div>
  );
}

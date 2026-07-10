import { Crosshair, X, FileText, Trophy, AlertTriangle, Network, Expand } from 'lucide-react';
import { useOmniVisionStore, ALL_CARD_TYPES } from '@/store/omnivision';
import { cn } from '@/lib/utils';
import type { TimelineCardData, CardType, CardData } from '@/types';
import { useExpand } from '@/hooks/useCardInteraction';
import CardExpansion from '@/components/CardExpansion';

interface RelatedIntel {
  type: CardType;
  label: string;
  sub: string;
  icon: typeof FileText;
  color: string;
}

/** 从当前看板的其他卡片中提取关联情报摘要（不调用 LLM） */
function getRelatedIntel(cards: Partial<Record<CardType, CardData>>): RelatedIntel[] {
  const result: RelatedIntel[] = [];

  const verdict = cards.verdict;
  if (verdict && 'title' in verdict) {
    result.push({
      type: 'verdict',
      label: '定性',
      sub: verdict.title,
      icon: FileText,
      color: 'text-emerald-400',
    });
  }

  const ach = cards.achievements;
  if (ach && 'items' in ach) {
    result.push({
      type: 'achievements',
      label: '成就',
      sub: `${ach.items.length} 项硬指标`,
      icon: Trophy,
      color: 'text-emerald-400',
    });
  }

  const dark = cards.darkside;
  if (dark && 'controversies' in dark) {
    result.push({
      type: 'darkside',
      label: '争议',
      sub: `${dark.controversies.length} 项争议`,
      icon: AlertTriangle,
      color: 'text-rose-400',
    });
  }

  const game = cards.gameplay;
  if (game && 'stakeholders' in game) {
    result.push({
      type: 'gameplay',
      label: '博弈',
      sub: `${game.stakeholders.length} 方博弈`,
      icon: Network,
      color: 'text-sky-400',
    });
  }

  return result;
}

export default function TimelineCard({ data }: { data: TimelineCardData }) {
  const events = data.events ?? [];

  const { expand } = useExpand();
  const phase = useOmniVisionStore((s) => s.phase);
  const expandedCard = useOmniVisionStore((s) => s.expandedCard);
  const setExpandedCard = useOmniVisionStore((s) => s.setExpandedCard);
  const isExpanded = expandedCard === 'timeline';

  const focusedIndex = useOmniVisionStore((s) => s.focusedTimelineIndex);
  const setFocusedTimelineIndex = useOmniVisionStore((s) => s.setFocusedTimelineIndex);
  const setFocusedCardIndex = useOmniVisionStore((s) => s.setFocusedCardIndex);
  const cards = useOmniVisionStore((s) => s.cards);

  const hasFocus = focusedIndex !== null && focusedIndex >= 0 && focusedIndex < events.length;
  const focusedEvent = hasFocus ? events[focusedIndex!] : null;
  const relatedIntel = hasFocus ? getRelatedIntel(cards) : [];

  // 点击空白处关闭浮层（节点与浮层内部已 stopPropagation）
  const handleRootClick = () => {
    if (hasFocus) setFocusedTimelineIndex(null);
  };

  const handleNodeClick = (i: number) => {
    setFocusedTimelineIndex(focusedIndex === i ? null : i);
  };

  // 滚动定位到对应卡片并短暂高亮（复用 B5 focusedCardIndex）
  const handleRelatedClick = (cardType: CardType) => {
    const el = document.querySelector(`[data-card-type="${cardType}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const idx = ALL_CARD_TYPES.indexOf(cardType);
    if (idx >= 0) {
      setFocusedCardIndex(idx);
      window.setTimeout(() => {
        useOmniVisionStore.getState().setFocusedCardIndex(null);
      }, 2000);
    }
    setFocusedTimelineIndex(null);
  };

  return (
    <div
      onClick={handleRootClick}
      className="dossier-card corner-brackets rounded-2xl border border-sky-500/15 p-6 h-full flex flex-col relative
                 hover:border-sky-500/40 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-sky-500/10"
    >
      {/* 背景大编号 */}
      <span className="bg-number text-sky-500" style={{ top: '-1rem', right: '0.5rem' }}>02</span>

      {/* 头部 */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="pulse-dot sky inline-block h-2 w-2 rounded-full bg-sky-400" />
          <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-sky-400/90">
            Timeline
          </span>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'results' && (
            <button
              type="button"
              onClick={() => {
                if (isExpanded) setExpandedCard(null);
                else expand('timeline', data);
              }}
              title={isExpanded ? '收起展开' : '深度展开'}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-sky-500/20 bg-sky-500/[0.04] text-sky-300 transition-colors hover:border-sky-500/40 hover:bg-sky-500/10"
            >
              {isExpanded ? <X className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
            </button>
          )}
          <span className="classification-stamp text-sky-400 border-sky-500/30">
            Chronology
          </span>
        </div>
      </div>

      <div className="relative z-10 mt-1 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
        核心转折 · {events.length} 节点
        {hasFocus && (
          <span className="ml-2 text-sky-400/80 normal-case tracking-normal">
            · 点击空白处关闭
          </span>
        )}
      </div>

      {/* 时间轴主体 — overflow-visible 让浮层可溢出到右侧 */}
      <div className="relative z-10 mt-5 flex-1 overflow-visible">
        {/* 竖直数据流轴线（自身保留 overflow-hidden 以容纳扫描光点） */}
        <div className="absolute left-[68px] top-2 bottom-2 w-px overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-sky-500/50 via-sky-500/20 to-transparent" />
          {/* 流动光点 */}
          <div
            className="absolute left-1/2 -translate-x-1/2 h-12 w-px bg-gradient-to-b from-transparent via-sky-300 to-transparent animate-[scanSweep_3s_linear_infinite]"
            style={{ animationName: 'scanSweep' }}
          />
        </div>

        <div className="flex flex-col gap-5">
          {events.map((ev, i) => {
            const isFocused = focusedIndex === i;
            const dim = hasFocus && !isFocused;
            return (
              <div
                key={`${ev.year}-${i}`}
                className={cn(
                  'relative pl-[88px] animate-fade-in-up transition-opacity duration-300',
                  dim && 'opacity-30',
                )}
                style={{ animationDelay: `${i * 120}ms` }}
              >
                {/* 年份大号标记 */}
                <span
                  className={cn(
                    'absolute left-0 top-0 w-16 text-right font-mono text-sm font-bold tabular-nums transition-colors',
                    isFocused ? 'text-sky-200' : 'text-sky-300',
                  )}
                >
                  {ev.year}
                </span>
                {/* 横向连接刻度 */}
                <span
                  className={cn(
                    'absolute left-[68px] top-2 h-px w-4 transition-colors',
                    isFocused ? 'bg-sky-300' : 'bg-sky-500/40',
                  )}
                />
                {/* 节点（可点击） */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(i);
                  }}
                  title={isFocused ? '取消聚焦' : '聚焦此节点'}
                  aria-label={isFocused ? '取消聚焦此节点' : '聚焦此节点'}
                  aria-pressed={isFocused}
                  className={cn(
                    'absolute left-[64px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 transition-all duration-200 cursor-pointer',
                    isFocused
                      ? 'scale-110 bg-sky-200 ring-sky-400/40 shadow-[0_0_16px_4px_rgba(56,189,248,0.7)]'
                      : 'bg-sky-400 ring-sky-500/10 pulse-dot sky hover:scale-125 hover:bg-sky-300 hover:ring-sky-400/30',
                  )}
                />
                {/* 内容 */}
                <h4 className="text-sm font-semibold text-zinc-100 font-sans leading-snug">
                  {ev.title}
                </h4>
                {ev.description && (
                  <p className="mt-1 text-xs text-zinc-400 leading-relaxed pr-2">
                    {ev.description}
                  </p>
                )}

                {/* B3 关联浮层 — 聚焦节点旁 */}
                {isFocused && focusedEvent && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-full ml-4 top-0 z-40 w-[280px] max-w-[280px] rounded-xl border border-sky-500/30 bg-zinc-950/95 backdrop-blur-sm p-4 shadow-2xl shadow-sky-500/20 animate-fade-in corner-brackets"
                  >
                    {/* 角标 */}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.25em] text-sky-400/90">
                        <Crosshair className="h-3 w-3" />
                        Node Intel
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedTimelineIndex(null);
                        }}
                        aria-label="关闭浮层"
                        className="text-zinc-500 hover:text-zinc-200 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* 事件年份大字 */}
                    <div className="mt-2 font-mono text-3xl font-black text-sky-300 tabular-nums leading-none">
                      {focusedEvent.year}
                    </div>
                    <h5 className="mt-1.5 text-sm font-semibold text-zinc-100 font-sans leading-tight">
                      {focusedEvent.title}
                    </h5>
                    {focusedEvent.description && (
                      <p className="mt-1.5 text-[11px] text-zinc-400 leading-relaxed">
                        {focusedEvent.description}
                      </p>
                    )}

                    {/* 相关情报 */}
                    {relatedIntel.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600 mb-2">
                          相关情报 · Related
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {relatedIntel.map((intel) => {
                            const Icon = intel.icon;
                            return (
                              <button
                                key={intel.type}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRelatedClick(intel.type);
                                }}
                                title={`定位至${intel.label}卡片`}
                                className="group flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-left transition-colors hover:border-sky-500/30 hover:bg-sky-500/10"
                              >
                                <Icon className={cn('h-3.5 w-3.5 shrink-0', intel.color)} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] font-mono text-zinc-500 group-hover:text-sky-300 transition-colors">
                                    {intel.label}
                                  </div>
                                  <div className="text-[11px] text-zinc-200 truncate">
                                    {intel.sub}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部刻度装饰 */}
      <div className="relative z-10 mt-3 flex items-center gap-1 pt-3 border-t border-white/5">
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className="h-2 flex-1 bg-sky-500/10"
            style={{ opacity: i % 5 === 0 ? 0.6 : 0.2 }}
          />
        ))}
      </div>

      {isExpanded && <CardExpansion cardType="timeline" />}
    </div>
  );
}

import { cn } from '@/lib/utils';
import type { CardType } from '@/types';

interface SkeletonCardProps {
  cardType: CardType;
}

function Bar({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-md', className)} />;
}

const META: Record<CardType, { label: string; num: string; accent: string }> = {
  verdict: { label: 'Decoding · 定性解码中', num: '01', accent: 'text-emerald-500' },
  timeline: { label: 'Scanning · 时间线扫描中', num: '02', accent: 'text-sky-500' },
  achievements: { label: 'Extracting · 战绩提取中', num: '03', accent: 'text-emerald-500' },
  darkside: { label: 'Intercepting · 反向截获中', num: '04', accent: 'text-rose-500' },
  gameplay: { label: 'Mapping · 博弈测绘中', num: '05', accent: 'text-sky-500' },
  trends: { label: 'Projecting · 趋势推演中', num: '06', accent: 'text-amber-500' },
};

function CardShell({ cardType, children }: { cardType: CardType; children: React.ReactNode }) {
  const meta = META[cardType];
  return (
    <div className="dossier-card corner-brackets rounded-2xl p-6 h-full flex flex-col gap-4 relative overflow-hidden">
      {/* 背景大编号 */}
      <span className={cn('bg-number', meta.accent)} style={{ top: '-1rem', right: '0.5rem' }}>
        {meta.num}
      </span>
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-600 animate-pulse-glow">
          {meta.label}
        </span>
        <Bar className="h-2 w-8" />
      </div>
      {children}
    </div>
  );
}

export default function SkeletonCard({ cardType }: SkeletonCardProps) {
  return (
    <CardShell cardType={cardType}>
      {cardType === 'verdict' && (
        <>
          <Bar className="h-8 w-5/6" />
          <Bar className="h-8 w-2/3" />
          <Bar className="h-4 w-full" />
          <div className="flex gap-2 mt-1">
            <Bar className="h-6 w-16 rounded-full" />
            <Bar className="h-6 w-20 rounded-full" />
            <Bar className="h-6 w-14 rounded-full" />
          </div>
        </>
      )}

      {cardType === 'timeline' && (
        <div className="flex flex-col gap-5 mt-1 flex-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Bar className="h-3 w-10 shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <Bar className="h-4 w-3/4" />
                <Bar className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {cardType === 'achievements' && (
        <div className="grid grid-cols-2 gap-3 mt-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Bar className="h-8 w-2/3" />
              <Bar className="h-2 w-full" />
              <Bar className="h-3 w-full" />
            </div>
          ))}
        </div>
      )}

      {cardType === 'darkside' && (
        <div className="flex flex-col gap-4 mt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Bar className="h-4 w-1/2" />
              <Bar className="h-2 w-full" />
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-5/6" />
            </div>
          ))}
        </div>
      )}

      {cardType === 'gameplay' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Bar className="h-4 w-2/3" />
                <Bar className="h-3 w-full" />
              </div>
            ))}
          </div>
          <Bar className="h-3 w-full mt-1" />
          <Bar className="h-3 w-4/5" />
        </>
      )}

      {cardType === 'trends' && (
        <>
          <Bar className="h-3 w-1/2 mt-1" />
          <div className="flex items-end gap-1.5 mt-2 h-20">
            <Bar className="h-8 w-full" />
            <Bar className="h-12 w-full" />
            <Bar className="h-6 w-full" />
            <Bar className="h-16 w-full" />
            <Bar className="h-10 w-full" />
            <Bar className="h-14 w-full" />
          </div>
          <Bar className="h-3 w-2/3 mt-2" />
        </>
      )}
    </CardShell>
  );
}

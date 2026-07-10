import { LayoutGrid, TrendingUp, TriangleAlert, Network } from 'lucide-react';
import { useOmniVisionStore, type ViewMode } from '@/store/omnivision';
import { cn } from '@/lib/utils';

interface ViewOption {
  mode: ViewMode;
  label: string;
  icon: typeof LayoutGrid;
  /** 非激活态图标色调 */
  iconClass: string;
}

// D3 多视角切换 — 四种信息视角
const VIEW_OPTIONS: ViewOption[] = [
  { mode: 'all', label: '全部', icon: LayoutGrid, iconClass: 'text-zinc-400' },
  { mode: 'positive', label: '正面', icon: TrendingUp, iconClass: 'text-emerald-400' },
  { mode: 'critical', label: '反面', icon: TriangleAlert, iconClass: 'text-rose-400' },
  { mode: 'game', label: '博弈', icon: Network, iconClass: 'text-sky-400' },
];

/**
 * D3 视角切换 — segmented control 风格按钮组。
 * 仅在 phase === 'results' 时显示。
 */
export default function ViewSwitcher() {
  const phase = useOmniVisionStore((s) => s.phase);
  const viewMode = useOmniVisionStore((s) => s.viewMode);
  const setViewMode = useOmniVisionStore((s) => s.setViewMode);

  if (phase !== 'results') return null;

  return (
    <div className="flex items-center gap-2 animate-fade-in">
      <span className="shrink-0 text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600">
        View
      </span>
      <span className="shrink-0 text-zinc-700">·</span>
      <div
        role="tablist"
        aria-label="信息视角切换"
        className="flex items-stretch overflow-hidden rounded-md border border-emerald-500/15 bg-zinc-900/30 backdrop-blur-sm"
      >
        {VIEW_OPTIONS.map(({ mode, label, icon: Icon, iconClass }, i) => {
          const isActive = viewMode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setViewMode(mode)}
              title={`切换至${label}视角`}
              className={cn(
                'group flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors',
                i > 0 && 'border-l border-emerald-500/10',
                isActive
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-zinc-500 hover:bg-emerald-500/[0.06] hover:text-zinc-300',
              )}
            >
              <Icon
                className={cn(
                  'h-3 w-3 shrink-0 transition-colors',
                  isActive ? iconClass : cn(iconClass, 'opacity-60'),
                )}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

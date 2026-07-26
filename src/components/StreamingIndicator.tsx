import { Brain, Search, Crosshair, ShieldCheck, FileText, Layers } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import type { AgentStage } from '@/store/omnivision';
import { cn } from '@/lib/utils';

const STAGE_LABELS: Record<AgentStage, string> = {
  thinking: '推理中',
  searching: '检索中',
  observing: '解析中',
  finalizing: '整合档案',
};

/** 信源颜色映射（与 SourcesPanel 一致） */
const SOURCE_COLORS: Record<string, string> = {
  tavily: 'bg-emerald-500',
  exa: 'bg-violet-500',
  github: 'bg-sky-500',
  news: 'bg-amber-500',
  social: 'bg-rose-500',
};

const SOURCE_LABELS: Record<string, string> = {
  tavily: 'Tavily',
  exa: 'Exa',
  github: 'GitHub',
  news: '新闻',
  social: '社媒',
};

/**
 * A3 流式状态指示器 — 仅在 searching 阶段显示
 * - 无 agentProgress（mock 降级 / 首卡前 200ms）：原 3 光点
 * - 有 agentProgress：紧凑信息条（stage + thought + searchQuery + counts + 多源构成），承载非首搜的"研究中"信息量
 * - 对比模式由全屏载体主导，紧凑条不渲染
 */
export default function StreamingIndicator() {
  const phase = useOmniVisionStore((s) => s.phase);
  const agentProgress = useOmniVisionStore((s) => s.agentProgress);
  const compareMode = useOmniVisionStore((s) => s.compareMode);

  if (phase !== 'searching') return null;

  // 对比模式由全屏载体主导，紧凑条不抢焦
  if (compareMode) return null;

  // 无 agent 进度（mock 降级 / 首卡前）→ 原 3 光点
  if (!agentProgress) {
    return (
      <div className="flex items-center justify-center gap-2 animate-fade-in">
        <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-emerald-400/80">
          DATA STREAMING
        </span>
        <span className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1 w-1 rounded-full bg-emerald-400"
              style={{
                animation: 'stream-dot 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </span>
      </div>
    );
  }

  // 紧凑信息条
  const stage = agentProgress.stage;
  const bySource = agentProgress.bySource ?? {};
  const bySourceEntries = Object.entries(bySource).filter(([, n]) => n > 0);
  const totalBySource = bySourceEntries.reduce((sum, [, n]) => sum + n, 0);
  const dimCount = agentProgress.coveredDimensions?.length ?? 0;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 backdrop-blur-sm px-3 py-2 animate-fade-in">
      <div className="flex items-center gap-3 text-[10px] font-mono">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-emerald-400/70 tracking-widest uppercase">
            {stage ? STAGE_LABELS[stage] : '研究中'}
          </span>
        </div>
        <span className="text-violet-400/70">
          <Brain className="h-3 w-3 inline mr-1" />
          {agentProgress.step}/{agentProgress.maxSteps}
        </span>
        {/* PRD-01 M3：维度覆盖实时展示 */}
        {dimCount > 0 && (
          <span className="flex items-center gap-1 text-cyan-400/70">
            <Layers className="h-3 w-3" />
            {dimCount}/6 维
          </span>
        )}
        <div className="ml-auto flex items-center gap-3 text-zinc-600">
          {typeof agentProgress.factsCount === 'number' && (
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              {agentProgress.factsCount}
            </span>
          )}
          {typeof agentProgress.sourcesCount === 'number' && (
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {agentProgress.sourcesCount}
            </span>
          )}
        </div>
      </div>

      {/* PRD-01 M3：多源构成实时进度条（searching/observing 阶段展示） */}
      {bySourceEntries.length > 0 && totalBySource > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full overflow-hidden bg-zinc-800/60 flex">
            {bySourceEntries.map(([src, n]) => {
              const pct = totalBySource > 0 ? (n / totalBySource) * 100 : 0;
              const color = SOURCE_COLORS[src] ?? 'bg-zinc-500';
              return (
                <div
                  key={src}
                  className={cn('h-full transition-all duration-300', color)}
                  style={{ width: `${pct}%` }}
                  title={`${SOURCE_LABELS[src] ?? src}: ${n}`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 text-[8px] font-mono">
            {bySourceEntries.map(([src, n]) => (
              <span key={src} className="flex items-center gap-0.5 text-zinc-500">
                <span className={cn('h-1 w-1 rounded-full', SOURCE_COLORS[src] ?? 'bg-zinc-500')} />
                <span className="text-zinc-400">{SOURCE_LABELS[src] ?? src}</span>
                <span className="text-zinc-300">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {agentProgress.thought && (
        <div className="mt-1 text-[10px] text-zinc-500 truncate">
          <span className="text-violet-400/50 mr-1">▸</span>
          {agentProgress.thought}
        </div>
      )}
      {(agentProgress.searchQuery || agentProgress.searchFocus) && (
        <div className="mt-1 flex items-center gap-3 text-[9px] font-mono">
          {agentProgress.searchQuery && (
            <span className="flex items-center gap-1 text-cyan-400/60 truncate">
              <Search className="h-3 w-3 shrink-0" />
              {agentProgress.searchQuery}
            </span>
          )}
          {agentProgress.searchFocus && (
            <span className="flex items-center gap-1 text-amber-400/50 truncate">
              <Crosshair className="h-3 w-3 shrink-0" />
              {agentProgress.searchFocus}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

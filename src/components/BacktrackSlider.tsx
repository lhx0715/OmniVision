/**
 * 回溯滑块 + 追问轨迹时间线（PRD-02 FR-08）
 *
 * - 滑块拖动 → 只渲染 created_by_step ≤ k 的子图
 * - 轨迹列表：每步追问记录，点击高亮该步新增子图
 * - 回退此步：删除第 k 步
 */
import { useState } from 'react';
import { History, Trash2, ChevronRight, Clock, X } from 'lucide-react';
import { useExploreStore } from '@/store/explore';
import { cn } from '@/lib/utils';

export default function BacktrackSlider() {
  const steps = useExploreStore((s) => s.steps);
  const backtrackStep = useExploreStore((s) => s.backtrackStep);
  const setBacktrackStep = useExploreStore((s) => s.setBacktrackStep);
  const deleteStep = useExploreStore((s) => s.deleteStep);
  const [showTimeline, setShowTimeline] = useState(false);

  if (steps.length === 0) return null;

  const maxStep = steps.length; // step 0 是种子，steps 数组里 0 是第一问
  const currentDisplay = backtrackStep === null ? maxStep : backtrackStep;

  return (
    <>
      {/* ===== 右上角：回溯滑块 ===== */}
      <div className="absolute top-4 right-4 z-20 w-64 rounded-xl border border-violet-500/15 bg-zinc-950/95 backdrop-blur-xl p-3 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <History className="h-3 w-3 text-violet-400" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
              回溯
            </span>
          </div>
          <button
            onClick={() => setShowTimeline((v) => !v)}
            className={cn(
              'text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors',
              showTimeline
                ? 'bg-violet-500/20 text-violet-200'
                : 'text-zinc-500 hover:text-violet-300',
            )}
          >
            轨迹
          </button>
        </div>

        {/* 滑块 */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-zinc-600 shrink-0">种子</span>
          <input
            type="range"
            min={0}
            max={maxStep}
            value={currentDisplay}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setBacktrackStep(v >= maxStep ? null : v)
            }}
            className="flex-1 h-1 accent-violet-500 cursor-pointer"
          />
          <span className="text-[9px] font-mono text-zinc-600 shrink-0">
            {backtrackStep === null ? '全部' : `${backtrackStep}/${maxStep}`}
          </span>
        </div>

        {/* 快捷按钮 */}
        <div className="mt-2 flex items-center gap-1">
          <button
            onClick={() => setBacktrackStep(null)}
            className={cn(
              'flex-1 rounded text-[9px] font-mono py-1 transition-colors',
              backtrackStep === null
                ? 'bg-violet-500/20 text-violet-200'
                : 'text-zinc-500 hover:bg-white/5',
            )}
          >
            全局观看
          </button>
          <button
            onClick={() => setBacktrackStep(Math.max(0, currentDisplay - 1))}
            disabled={currentDisplay <= 0}
            className="rounded px-1.5 py-1 text-[9px] font-mono text-zinc-500 hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            ←
          </button>
          <button
            onClick={() => setBacktrackStep(Math.min(maxStep, currentDisplay + 1) >= maxStep ? null : currentDisplay + 1)}
            disabled={currentDisplay >= maxStep}
            className="rounded px-1.5 py-1 text-[9px] font-mono text-zinc-500 hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            →
          </button>
        </div>
      </div>

      {/* ===== 轨迹时间线（展开态）===== */}
      {showTimeline && (
        <div className="absolute top-32 right-4 z-20 w-64 max-h-[60vh] rounded-xl border border-violet-500/15 bg-zinc-950/95 backdrop-blur-xl p-3 shadow-xl overflow-y-auto animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
              追问轨迹
            </span>
            <button
              onClick={() => setShowTimeline(false)}
              className="text-zinc-600 hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-1.5">
            {steps.map((step, idx) => {
              const stepNo = idx + 1
              const isActive = backtrackStep === stepNo
              return (
                <div
                  key={step.id}
                  className={cn(
                    'rounded-lg border p-2 transition-colors cursor-pointer',
                    isActive
                      ? 'border-violet-500/40 bg-violet-500/[0.08]'
                      : 'border-white/[0.04] bg-white/[0.01] hover:border-white/10',
                  )}
                  onClick={() => setBacktrackStep(isActive ? null : stepNo)}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-mono text-violet-400/70 shrink-0">
                      #{stepNo}
                    </span>
                    <Clock className="h-2.5 w-2.5 text-zinc-600 shrink-0" />
                    <span className="text-[10px] text-zinc-500 truncate">
                      {step.targetLabel || '?'}
                    </span>
                    <ChevronRight className="h-2.5 w-2.5 text-zinc-700 shrink-0" />
                    <span className="text-[10px] text-zinc-400 truncate flex-1">
                      {step.question}
                    </span>
                  </div>
                  {step.answerSummary && (
                    <p className="text-[10px] text-zinc-600 leading-relaxed line-clamp-2">
                      {step.answerSummary}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-[9px] font-mono text-zinc-700">
                    <span>+{step.addedNodeIds.length} 节点</span>
                    <span>+{step.addedEdgeIds.length} 边</span>
                    {stepNo > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`确认回退第 ${stepNo} 步？该步新增的节点/边将被删除。`)) {
                            deleteStep(stepNo)
                          }
                        }}
                        className="ml-auto flex items-center gap-0.5 text-rose-500/60 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        回退
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

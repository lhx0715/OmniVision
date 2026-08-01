import { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Check, FileText, ScanSearch, Clock, Brain, Search, ShieldCheck, Crosshair } from 'lucide-react';
import type { Phase, AgentProgress, AgentTimelineEntry, AgentStage } from '@/store/omnivision';

interface ArchiveUnsealTransitionProps {
  query: string;
  fileNo: string;
  phase: Phase;
  agentProgress: AgentProgress | null;
  agentTimeline: AgentTimelineEntry[];
  onComplete: () => void;
}

// 搜索阶段术语 — 根据 agent 的 stage 子阶段映射
const STAGE_LABELS: Record<AgentStage, string> = {
  thinking: '推理中',
  searching: '检索中',
  observing: '解析中',
  finalizing: '整合档案',
};

const STAGE_COLORS: Record<AgentStage, string> = {
  thinking: 'text-violet-400/70',
  searching: 'text-cyan-400/70',
  observing: 'text-emerald-400/70',
  finalizing: 'text-amber-400/70',
};

// 五维情报覆盖
const DIMENSIONS: { key: string; label: string }[] = [
  { key: 'verdict', label: '定性' },
  { key: 'timeline', label: '时间线' },
  { key: 'achievements', label: '成就' },
  { key: 'darkside', label: '反面' },
  { key: 'gameplay', label: '关系网' },
];

// 思考流时间线条目
function TimelineEntry({ entry }: { entry: AgentTimelineEntry }) {
  return (
    <div
      className="text-[10px] leading-relaxed bg-white/[0.02] rounded px-2 py-1.5 border border-white/[0.04]"
      style={{ animation: 'data-slide-in 0.4s ease-out forwards' }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`font-mono text-[8px] tracking-wider uppercase ${STAGE_COLORS[entry.stage]}`}>
          {STAGE_LABELS[entry.stage]}
        </span>
        <span className="font-mono text-[8px] text-zinc-700">#{entry.step}</span>
      </div>
      {entry.thought && <div className="text-zinc-500">{entry.thought}</div>}
      {entry.searchQuery && (
        <div className="text-cyan-400/60 font-mono truncate">→ {entry.searchQuery}</div>
      )}
      {entry.searchFocus && (
        <div className="text-amber-400/50 font-mono truncate text-[9px]">聚焦: {entry.searchFocus}</div>
      )}
      {entry.newSources && entry.newSources.length > 0 && (
        <div className="text-emerald-400/50 font-mono text-[9px]">+{entry.newSources.length} 信源</div>
      )}
      {entry.newFacts && entry.newFacts.length > 0 && (
        <div className="space-y-0.5">
          {entry.newFacts.map((f, i) => (
            <div key={i} className="text-violet-400/50 truncate">
              <span className="text-violet-400/40">[{f.category}]</span> {f.content}
            </div>
          ))}
        </div>
      )}
      {entry.quality && entry.quality !== 'sufficient' && entry.gaps && entry.gaps.length > 0 && (
        <div className="text-amber-500/40 font-mono text-[9px]">缺口: {entry.gaps.slice(0, 2).join(' · ')}</div>
      )}
    </div>
  );
}

export default function ArchiveUnsealTransition({
  query,
  fileNo,
  phase,
  agentProgress,
  agentTimeline,
  onComplete,
}: ArchiveUnsealTransitionProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const completedRef = useRef(false);

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // ===== 进度计算：基于 agent 实际进度 =====
  // 目标进度 = (step / maxSteps) * 90，留 10% 给最终卡片生成
  // quality=sufficient 时跳到 95%
  // displayProgress 平滑追赶目标进度（缓动），不再用固定时间动画
  const targetProgress = useRef(0);

  useEffect(() => {
    if (agentProgress) {
      const baseRatio = agentProgress.step / agentProgress.maxSteps;
      // quality=sufficient 时进度跳到 95%
      if (agentProgress.quality === 'sufficient') {
        targetProgress.current = 95;
      } else {
        // 基础进度 90% 上限，加上 factsCount 的微调（每条事实加 1%，最多 +5%）
        const factsBonus = Math.min((agentProgress.factsCount ?? 0) * 1, 5);
        targetProgress.current = Math.min(baseRatio * 90 + factsBonus, 90);
      }
    } else if (phase === 'searching') {
      // 无 agent 进度时（mock 模式或降级），给一个缓慢爬升的初始进度
      targetProgress.current = Math.min(targetProgress.current + 2, 30);
    }
  }, [agentProgress, phase]);

  // 平滑追赶目标进度
  useEffect(() => {
    let raf: number;
    const animate = () => {
      setDisplayProgress((prev) => {
        const diff = targetProgress.current - prev;
        if (Math.abs(diff) < 0.5) return prev;
        // 缓动：每帧追赶差值的 8%，给"缓慢发展"的视觉效果
        return prev + diff * 0.08;
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ===== 结果阶段触发 =====
  // phase=results 表示后端已推送 done，卡片开始流入。
  // 此时无论 agent 是否推送过 quality=sufficient，都强制 targetProgress 推到 100，
  // 让 displayProgress 平滑追赶到 95 后触发结果态展示。
  // （旧逻辑依赖 quality=sufficient 才到 95，若该事件丢失/时序错位则进度卡在 90，遮罩永不退出）
  useEffect(() => {
    if (phase === 'results' && !showResult) {
      targetProgress.current = 100;
    }
  }, [phase, showResult]);

  useEffect(() => {
    if (displayProgress >= 95 && phase === 'results' && !showResult) {
      const t = setTimeout(() => setShowResult(true), 200);
      return () => clearTimeout(t);
    }
  }, [displayProgress, phase, showResult]);

  // 兜底：phase 进入 results 后硬性 4s 上限强制展示结果态。
  // 防止标签页后台化导致 RAF 被节流、displayProgress 迟迟不到 95 时遮罩永久卡死。
  useEffect(() => {
    if (phase !== 'results' || showResult) return;
    const t = setTimeout(() => setShowResult(true), 4000);
    return () => clearTimeout(t);
  }, [phase, showResult]);

  // ===== 退出路径 =====
  useEffect(() => {
    if (phase === 'clarifying') {
      setFadingOut(true);
      const t = setTimeout(() => handleComplete(), 400);
      return () => clearTimeout(t);
    }
  }, [phase, handleComplete]);

  // 兜底：phase 回退到 idle（网络错误）或进入 blocked（风控拦截）时，立即淡出退出
  // 后端拦截发生在 searching 阶段，此处淡出让 BlockedView 显现，避免遮罩盖住结果态
  useEffect(() => {
    if ((phase === 'idle' || phase === 'blocked') && !showResult) {
      setFadingOut(true);
      const t = setTimeout(() => handleComplete(), 300);
      return () => clearTimeout(t);
    }
  }, [phase, showResult, handleComplete]);

  useEffect(() => {
    if (showResult) {
      const t1 = setTimeout(() => setStamped(true), 500);
      const t2 = setTimeout(() => {
        setFadingOut(true);
        setTimeout(() => handleComplete(), 600);
      }, 1600);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [showResult, handleComplete]);

  if (fadingOut) {
    return (
      <div className="fixed inset-0 z-[100] pointer-events-none transition-opacity duration-500 opacity-0">
        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md" />
      </div>
    );
  }

  const progressInt = Math.round(displayProgress);
  const hasAgent = Boolean(agentProgress);

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/80 backdrop-blur-md overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-10" />
      <div className="absolute inset-0 scan-line opacity-20" />

      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScanSearch className="h-4 w-4 text-emerald-500/60" />
          <span className="text-[10px] font-mono text-zinc-400 tracking-widest">ARCHIVE DATABASE</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-mono text-zinc-600 tracking-widest">REF. </span>
          <span className="text-[10px] font-mono text-cyan-400 tracking-widest">{fileNo}</span>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-4">
        {!showResult ? (
          <div className="w-full max-w-4xl">
            <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl archive-search-card">
              <div className="p-5 md:p-6">
                {/* 顶部：stage 标签 + 轮次 + 进度% */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-mono text-emerald-400/70 tracking-widest uppercase">
                      {hasAgent && agentProgress?.stage
                        ? STAGE_LABELS[agentProgress.stage]
                        : hasAgent
                          ? '深度研究中'
                          : '检索中...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600">
                    {hasAgent && agentProgress && (
                      <span className="flex items-center gap-1 text-violet-400/80">
                        <Brain className="h-3 w-3" />
                        {agentProgress.step}/{agentProgress.maxSteps}
                      </span>
                    )}
                    <span>{progressInt}%</span>
                  </div>
                </div>

                {/* query 显示 */}
                <div className="text-center py-3 mb-4">
                  <div className="text-[10px] font-mono text-zinc-600 tracking-[0.4em] uppercase mb-2">
                    SEARCHING FOR
                  </div>
                  <div className="text-xl md:text-2xl font-bold text-zinc-200 tracking-wider truncate">
                    {query}
                  </div>
                </div>

                {/* 进度条 */}
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-5">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${progressInt}%` }}
                  />
                </div>

                {/* 主区：左 timeline + 右 雷达/信源（仅 hasAgent 时） */}
                {hasAgent && agentProgress ? (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
                    {/* 左：思考流时间线 */}
                    <div className="min-h-0">
                      <div className="flex items-center gap-1.5 mb-2 text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
                        <Brain className="h-3 w-3" />
                        <span>思考流</span>
                      </div>
                      <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
                        {agentTimeline.length === 0 ? (
                          <div className="text-[10px] font-mono text-zinc-600 py-4 text-center">
                            正在初始化研究...
                          </div>
                        ) : (
                          agentTimeline.map((entry) => (
                            <TimelineEntry key={entry.id} entry={entry} />
                          ))
                        )}
                      </div>
                    </div>

                    {/* 右：维度覆盖雷达 + 信源曝光 */}
                    <div className="space-y-4">
                      {/* 维度雷达 */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2 text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
                          <ShieldCheck className="h-3 w-3" />
                          <span>维度覆盖</span>
                        </div>
                        <div className="space-y-1.5">
                          {DIMENSIONS.map((dim) => {
                            const covered = (agentProgress.coveredDimensions ?? []).includes(dim.key);
                            return (
                              <div key={dim.key} className="flex items-center gap-2 text-[9px] font-mono">
                                <span className="w-12 text-zinc-500">{dim.label}</span>
                                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                                    style={{
                                      width: covered ? '100%' : '0%',
                                      animation: covered ? 'bar-grow 0.5s ease-out' : undefined,
                                    }}
                                  />
                                </div>
                                <span className={covered ? 'text-emerald-400/70' : 'text-zinc-700'}>
                                  {covered ? '✓' : '·'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 信源曝光 */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2 text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
                          <FileText className="h-3 w-3" />
                          <span>信源</span>
                          {typeof agentProgress.sourcesCount === 'number' && (
                            <span className="text-zinc-500">{agentProgress.sourcesCount}</span>
                          )}
                        </div>
                        <div className="space-y-1 max-h-[20vh] overflow-y-auto">
                          {agentProgress.newSources && agentProgress.newSources.length > 0 ? (
                            agentProgress.newSources.slice(0, 5).map((src, i) => (
                              <div key={i} className="text-[9px] font-mono text-cyan-400/60 truncate" title={src.title}>
                                · {src.title}
                              </div>
                            ))
                          ) : (
                            <div className="text-[9px] font-mono text-zinc-700">等待首批信源...</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-[10px] font-mono text-zinc-600">
                    <Clock className="h-4 w-4 mx-auto mb-2 text-zinc-700" />
                    扫描档案库...
                  </div>
                )}

                {/* 底部：当前搜索词 + focus + counts */}
                {hasAgent && agentProgress && (agentProgress.searchQuery || agentProgress.searchFocus) && (
                  <div className="mt-4 pt-3 border-t border-white/[0.04] flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] font-mono">
                    {agentProgress.searchQuery && (
                      <div className="flex items-center gap-1.5 text-cyan-400/70">
                        <Search className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[200px]">{agentProgress.searchQuery}</span>
                      </div>
                    )}
                    {agentProgress.searchFocus && (
                      <div className="flex items-center gap-1.5 text-amber-400/60">
                        <Crosshair className="h-3 w-3 shrink-0" />
                        <span className="truncate">{agentProgress.searchFocus}</span>
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-3 text-zinc-600">
                      {typeof agentProgress.factsCount === 'number' && (
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          {agentProgress.factsCount} 事实
                        </span>
                      )}
                      {typeof agentProgress.sourcesCount === 'number' && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {agentProgress.sourcesCount} 信源
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-lg">
            <div className="relative archive-result-in">
              <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-emerald-500/40" />
              <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-emerald-500/40" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-emerald-500/40" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-emerald-500/40" />

              <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 border border-emerald-500/40 rounded-lg overflow-hidden shadow-2xl">
                <div className="absolute inset-0 bg-grid opacity-10" />
                <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-emerald-500/10 to-transparent" />

                <div className="p-6 md:p-10 relative">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-emerald-400" />
                      <span className="text-[11px] font-mono text-emerald-400/80 tracking-[0.3em] uppercase">
                        DOSSIER FOUND
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ animation: `pulse-ring 1.5s ease-out infinite`, animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent mb-8" />

                  <div className="text-center mb-8">
                    <div className="text-[10px] font-mono text-zinc-500 tracking-[0.4em] uppercase mb-4">SUBJECT</div>
                    <div className="text-3xl md:text-5xl font-bold text-white tracking-wider">
                      {query}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-black/40 rounded-lg p-4 border border-white/5">
                      <div className="text-[8px] font-mono text-zinc-600 tracking-widest mb-2">CLASSIFICATION</div>
                      <div className="text-sm font-mono text-cyan-400">INTELLIGENCE</div>
                    </div>
                    <div className="bg-black/40 rounded-lg p-4 border border-emerald-500/20">
                      <div className="text-[8px] font-mono text-zinc-600 tracking-widest mb-2">ACCESS</div>
                      <div className="text-sm font-mono text-emerald-400">GRANTED</div>
                    </div>
                  </div>
                </div>

                {stamped && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="archive-stamp-bounce">
                      <div className="relative">
                        <div className="absolute -inset-6 border border-emerald-500/20 rounded-full animate-ping" />
                        <div className="border-[3px] border-emerald-500/90 rounded-lg px-8 py-4 text-center bg-emerald-500/10 backdrop-blur-sm shadow-[0_0_60px_rgba(16,185,129,0.4)]">
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <Check className="h-5 w-5 text-emerald-400" />
                            <span className="text-2xl md:text-3xl font-black text-emerald-400 tracking-widest">
                              VERIFIED
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-emerald-400/70 tracking-[0.3em]">
                            ACCESS GRANTED
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between">
                  <span className="text-[8px] font-mono text-zinc-700">{fileNo}</span>
                  <div className="flex items-center gap-2">
                    <Lock className="h-3 w-3 text-emerald-500/40" />
                    <span className="text-[8px] font-mono text-emerald-500/40">DECRYPTED</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-8">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-all ${!showResult ? 'bg-emerald-500 scale-125' : 'bg-zinc-700'}`} />
          <span className="text-[9px] font-mono text-zinc-500 tracking-widest">SEARCHING</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-all ${showResult && !stamped ? 'bg-emerald-500 scale-125' : 'bg-zinc-700'}`} />
          <span className="text-[9px] font-mono text-zinc-500 tracking-widest">FOUND</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-all ${stamped ? 'bg-emerald-500 scale-125' : 'bg-zinc-700'}`} />
          <span className="text-[9px] font-mono text-zinc-500 tracking-widest">VERIFIED</span>
        </div>
      </div>
    </div>
  );
}

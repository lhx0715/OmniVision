import { useState, useEffect, useRef } from 'react';
import { Radar, AlertCircle, X, Fingerprint, Crosshair, Archive, BookMarked, Network } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import { useAuthStore } from '@/store/auth';
import { useSSE } from '@/hooks/useSSE';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import SearchBar from '@/components/SearchBar';
import ClarifyPanel from '@/components/ClarifyPanel';
import BentoGrid from '@/components/BentoGrid';
import CompareView from '@/components/CompareView';
import Breadcrumb from '@/components/Breadcrumb';
import BlurText from '@/components/BlurText';
import SourcesPanel from '@/components/SourcesPanel';
import ViewSwitcher from '@/components/ViewSwitcher';
import ArchiveDrawer from '@/components/ArchiveDrawer';
import ExportButton from '@/components/ExportButton';
import BackgroundFX from '@/components/BackgroundFX';
import StreamingIndicator from '@/components/StreamingIndicator';
import ArchiveUnsealTransition from '@/components/ArchiveUnsealTransition';
import RiskToast from '@/components/RiskToast';
import BlockedView from '@/components/BlockedView';
import UserMenu from '@/components/UserMenu';
import { saveArchiveEntry } from '@/lib/archive';
import { detectCompare } from '@/lib/compare';
import { saveResultSnapshot, getResultSnapshot, type ResultSnapshot } from '@/lib/resultCache';
import { localDictCheck } from '../../shared/riskDict';
import type { CardType, CardData, ClarifyOption, EntityType } from '@/types';

/** 雷达扫描装饰 SVG */
function RadarSweep() {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" fill="none">
      <defs>
        <radialGradient id="radarFade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="90" fill="url(#radarFade)" />
      <circle cx="100" cy="100" r="90" stroke="#10b981" strokeOpacity="0.15" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="65" stroke="#10b981" strokeOpacity="0.12" strokeWidth="0.5" strokeDasharray="2 3" />
      <circle cx="100" cy="100" r="40" stroke="#10b981" strokeOpacity="0.1" strokeWidth="0.5" strokeDasharray="2 3" />
      <circle cx="100" cy="100" r="15" stroke="#10b981" strokeOpacity="0.2" strokeWidth="0.5" />
      {/* 十字线 */}
      <line x1="100" y1="10" x2="100" y2="190" stroke="#10b981" strokeOpacity="0.08" strokeWidth="0.5" />
      <line x1="10" y1="100" x2="190" y2="100" stroke="#10b981" strokeOpacity="0.08" strokeWidth="0.5" />
      {/* 扫描扇形 */}
      <g style={{ transformOrigin: '100px 100px', animation: 'spin 6s linear infinite' }}>
        <path d="M 100 100 L 190 100 A 90 90 0 0 0 136 36 Z" fill="url(#sweepGrad)" />
      </g>
      {/* 随机目标点 */}
      {[
        { x: 145, y: 75 },
        { x: 70, y: 130 },
        { x: 130, y: 140 },
      ].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="#10b981" className="animate-pulse-glow" style={{ animationDelay: `${i * 0.5}s` }} />
      ))}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

/**
 * 瞬时恢复快照到 store 并切换到 results 阶段，跳过 SSE 重新搜索。
 * 调用前应已 setQuery / setEntityType（与 handleArchiveSelect/handleNavigate 一致）。
 * 先 clearCards 清空旧状态（含 compare/agent/sources/images 全量重置），
 * 再逐张回填卡片与信源数据，最后落定到 results 阶段。
 */
function restoreFromSnapshot(snapshot: ResultSnapshot): void {
  const s = useOmniVisionStore.getState();
  s.clearCards();
  s.resetAgentTimeline();
  // 逐张回填卡片，复用 addCard 逻辑保持 store 一致性（streamingCards 已为空，filter 无副作用）
  for (const [type, data] of Object.entries(snapshot.cards)) {
    s.addCard(type as CardType, data as CardData);
  }
  s.setSources(snapshot.sources);
  s.setImages(snapshot.images);
  s.setSourceStats(snapshot.sourceStats);
  s.setEntityType(snapshot.entityType);
  s.setEngineMode(snapshot.engineMode);
  s.setStreamingCards([]);
  s.setPhase('results');
}

export default function Home() {
  const phase = useOmniVisionStore((s) => s.phase);
  const error = useOmniVisionStore((s) => s.error);
  const query = useOmniVisionStore((s) => s.query);
  const blockInfo = useOmniVisionStore((s) => s.blockInfo);
  const agentProgress = useOmniVisionStore((s) => s.agentProgress);
  const agentTimeline = useOmniVisionStore((s) => s.agentTimeline);
  const engineMode = useOmniVisionStore((s) => s.engineMode);
  const setQuery = useOmniVisionStore((s) => s.setQuery);
  const setEntityType = useOmniVisionStore((s) => s.setEntityType);
  const setError = useOmniVisionStore((s) => s.setError);
  const setArchiveOpen = useOmniVisionStore((s) => s.setArchiveOpen);
  const compareMode = useOmniVisionStore((s) => s.compareMode);

  // 认证状态（会话恢复由 App.tsx 全局负责，避免页面 HMR 重复触发 net::ERR_ABORTED）
  const authUser = useAuthStore((s) => s.user);

  const { start, startCompare, abort } = useSSE();
  useKeyboardNav();
  const [transitioning, setTransitioning] = useState(false);

  const handleSubmit = (q: string) => {
    // 前端本地字典前置预检（<5ms，零网络消耗）
    // 命中显性违规词 → 统一导向 blocked 结果态（BlockedView），不发起任何 API 请求，输入框文字保留
    const compare = detectCompare(q);
    if (compare.isCompare) {
      const checkA = localDictCheck(compare.queryA);
      const checkB = localDictCheck(compare.queryB);
      if (checkA.blocked || checkB.blocked) {
        const hit = checkA.blocked ? checkA : checkB;
        setQuery(q);
        useOmniVisionStore.getState().setBlockInfo({
          reason: hit.reason,
          layer: 'frontend',
          query: checkA.blocked ? compare.queryA : compare.queryB,
          inCompare: true,
          compareSide: checkA.blocked ? 'A' : 'B',
          timestamp: Date.now(),
        });
        useOmniVisionStore.getState().setPhase('blocked');
        return;
      }
    } else {
      const riskCheck = localDictCheck(q);
      if (riskCheck.blocked) {
        setQuery(q);
        useOmniVisionStore.getState().setBlockInfo({
          reason: riskCheck.reason,
          layer: 'frontend',
          query: q,
          inCompare: false,
          timestamp: Date.now(),
        });
        useOmniVisionStore.getState().setPhase('blocked');
        return;
      }
    }

    setQuery(q);
    const wasIdle = phase === 'idle';
    // C1 对比模式检测
    if (compare.isCompare) {
      const et = useOmniVisionStore.getState().entityType;
      useOmniVisionStore.getState().pushHistory(q, et);
      if (wasIdle) setTransitioning(true);
      startCompare(compare.queryA, compare.queryB);
      return;
    }
    const et = useOmniVisionStore.getState().entityType;
    useOmniVisionStore.getState().pushHistory(q, et);
    if (wasIdle) setTransitioning(true);
    start(q, et ?? undefined);
  };

  // B2 标签关联搜索 — 点击定性卡片标签触发新搜索并入栈
  const handleTagClick = (tag: string) => {
    setQuery(tag);
    const et = useOmniVisionStore.getState().entityType;
    useOmniVisionStore.getState().pushHistory(tag, et);
    start(tag, et ?? undefined);
  };

  // B2 面包屑回溯 — 返回历史条目：命中前端快照则瞬时恢复，否则重新搜索
  const handleNavigate = (query: string, entityType: EntityType | null) => {
    setQuery(query);
    const snapshot = getResultSnapshot(query, entityType);
    if (snapshot) {
      // 终止可能在途的 SSE，避免残留事件覆盖快照恢复
      abort();
      restoreFromSnapshot(snapshot);
      return;
    }
    start(query, entityType ?? undefined);
  };

  // C2 档案回看 — 命中前端快照则瞬时恢复（跳过 SSE 重搜与加载动画），否则触发新搜索并入栈
  const handleArchiveSelect = (query: string, entityType: EntityType | null) => {
    setQuery(query);
    if (entityType) setEntityType(entityType);
    useOmniVisionStore.getState().pushHistory(query, entityType);
    const snapshot = getResultSnapshot(query, entityType);
    if (snapshot) {
      abort();
      restoreFromSnapshot(snapshot);
      return;
    }
    start(query, entityType ?? undefined);
  };

  const handleClarify = (opt: ClarifyOption) => {
    const searchQ = opt.searchQuery ?? opt.label;
    setQuery(searchQ);
    setEntityType(opt.entityType);
    useOmniVisionStore.getState().pushHistory(searchQ, opt.entityType);
    start(searchQ, opt.entityType);
  };

  const handleReset = () => {
    useOmniVisionStore.getState().reset();
  };

  // 生成档案编号（稳定，仅首次渲染生成）
  const [fileNo] = useState(
    () => `OV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
  );

  // C2 — 搜索完成时（phase 变为 results）自动入库 + 存前端结果快照
  // 用 ref 记录已归档的 query，避免 results 阶段重复渲染时重复入库
  const archivedQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'results') return;
    const state = useOmniVisionStore.getState();
    if (!state.query) return;
    if (archivedQueryRef.current === state.query) return;
    archivedQueryRef.current = state.query;
    saveArchiveEntry({
      query: state.query,
      entityType: state.entityType,
      engineMode: state.engineMode === 'live' ? 'live' : 'mock',
      timestamp: Date.now(),
    });
    // 存前端结果快照：仅单实体搜索（对比模式状态结构不同，跳过），
    // 供档案库 / 面包屑回溯时瞬时恢复，跳过 SSE 重新搜索
    if (!state.compareMode) {
      saveResultSnapshot({
        query: state.query,
        entityType: state.entityType,
        engineMode: state.engineMode,
        cards: state.cards,
        sources: state.sources,
        images: state.images,
        sourceStats: state.sourceStats,
      });
    }
  }, [phase]);

  // 进入新一轮搜索时清空归档标记
  useEffect(() => {
    if (phase === 'searching') {
      archivedQueryRef.current = null;
    }
  }, [phase]);

  const isActive = phase !== 'idle';

  return (
    <div className="relative min-h-screen flex flex-col text-zinc-200 bg-gradient-to-tr from-zinc-950 via-neutral-950 to-zinc-900">
      {/* A1 全局背景动效 */}
      <BackgroundFX />
      {/* 风控拦截 Toast */}
      <RiskToast />
      {/* 网格线背景 */}
      <div className="grid-lines pointer-events-none fixed inset-0 z-0" />

      {/* 顶部辉光 */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 z-0 h-[380px] w-[760px] rounded-full bg-emerald-500/[0.04] blur-[130px]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.03]">
        <button
          onClick={handleReset}
          className="flex items-center gap-2.5 group cursor-pointer"
        >
          <div className="relative">
            <Radar className="h-5 w-5 text-emerald-400 group-hover:rotate-180 transition-transform duration-700" />
          </div>
          <span className="font-mono text-sm tracking-[0.25em] text-zinc-300 group-hover:text-emerald-300 transition-colors">
            OMNIVISION
          </span>
        </button>

        {/* 中部坐标条 */}
        <div className="hidden md:flex items-center gap-3 text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
          <Crosshair className="h-3 w-3" />
          <span>LAT 39.9042°N</span>
          <span className="text-zinc-700">/</span>
          <span>LON 116.4074°E</span>
          <span className="text-zinc-700">/</span>
          <span className="text-emerald-500/60">SIGNAL OK</span>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-mono tracking-widest text-zinc-600 uppercase">
          <div className="hidden sm:flex items-center gap-1.5">
            <Fingerprint className="h-3 w-3" />
            <span>机密档案 · v0.2</span>
          </div>

          {/* 知识库入口 — 登录后可见 */}
          {authUser && (
            <button
              type="button"
              onClick={() => window.location.assign('/library')}
              title="我的知识库"
              aria-label="我的知识库"
              className="flex items-center gap-1.5 rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] px-2.5 py-1 text-cyan-300 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-200"
            >
              <BookMarked className="h-3 w-3" />
              <span>知识库</span>
            </button>
          )}

          {/* 探索图谱入口 — 登录后可见 */}
          {authUser && (
            <button
              type="button"
              onClick={() => window.location.assign('/graph-library')}
              title="探索图谱知识库"
              aria-label="探索图谱知识库"
              className="flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/[0.04] px-2.5 py-1 text-violet-300 transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-200"
            >
              <Network className="h-3 w-3" />
              <span>探索</span>
            </button>
          )}

          {/* 档案库入口 */}
          <button
            type="button"
            onClick={() => setArchiveOpen(true)}
            title="打开情报档案库"
            aria-label="打开情报档案库"
            className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-2.5 py-1 text-emerald-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200"
          >
            <Archive className="h-3 w-3" />
            <span>档案库</span>
          </button>

          {/* 用户入口 — 登录/注册 + 退出登录（共享组件，任意页面可复用） */}
          <UserMenu />
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col">
        {!isActive ? (
          /* ===== 静止态：居中搜索框 + 雷达扫描 + BlurText 大标题 ===== */
          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4 relative">
            {/* 雷达背景装饰 */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-40">
              <div className="w-[420px] h-[420px] max-w-[80vw] max-h-[80vw]">
                <RadarSweep />
              </div>
            </div>

            <div className="relative text-center z-10">
              <div className="flex items-center justify-center gap-4 mb-6 animate-fade-in" style={{ animationDelay: '0.2s', opacity: 0 }}>
                <span className="h-px w-16 md:w-24 bg-gradient-to-r from-transparent to-emerald-500/40" />
                <span className="text-[10px] md:text-xs font-mono tracking-[0.5em] text-emerald-500/50 uppercase">OmniVision</span>
                <span className="h-px w-16 md:w-24 bg-gradient-to-l from-transparent to-emerald-500/40" />
              </div>
              <div className="relative inline-block">
                <div className="text-5xl md:text-8xl lg:text-9xl font-black font-sans tracking-tight text-white">
                  {['全', '知', '视', '界'].map((char, i) => (
                    <span
                      key={i}
                      className="inline-block relative"
                      style={{
                        animation: `title-reveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards, title-pulse 4s ease-in-out infinite`,
                        animationDelay: `${0.15 + i * 0.15}s, ${2 + i * 0.2}s`,
                        opacity: 0,
                        textShadow: '0 0 30px rgba(110,231,183,0.4), 0 0 60px rgba(16,185,129,0.2)',
                      }}
                    >
                      <span className="relative z-10">{char}</span>
                      <span className="absolute inset-0 text-rose-500/60 -z-10 select-none" style={{ transform: 'translateX(-1.5px)', animation: `glitch-chroma-r 4s ease-in-out infinite`, animationDelay: `${2 + i * 0.2}s`, opacity: 0 }} aria-hidden="true">{char}</span>
                      <span className="absolute inset-0 text-cyan-500/60 -z-10 select-none" style={{ transform: 'translateX(1.5px)', animation: `glitch-chroma-c 4s ease-in-out infinite`, animationDelay: `${2 + i * 0.2}s`, opacity: 0 }} aria-hidden="true">{char}</span>
                    </span>
                  ))}
                </div>
                <div className="absolute -inset-4 blur-3xl bg-emerald-500/20 -z-10" />
              </div>
              <p className="mt-8 text-zinc-500 font-mono text-[11px] md:text-xs tracking-[0.3em] uppercase animate-fade-in" style={{ animationDelay: '0.8s', opacity: 0 }}>
                Dashboard over Chat · 看板即答案 · 拒绝废话
              </p>
            </div>
            <SearchBar active={false} onSubmit={handleSubmit} />

            {/* 三类型标识 */}
            <div className="relative flex gap-2 text-[11px] font-mono text-zinc-600 animate-fade-in" style={{ animationDelay: '1.2s', opacity: 0 }}>
              {[
                { t: '人', c: 'border-emerald-500/20 text-emerald-400' },
                { t: '事', c: 'border-sky-500/20 text-sky-400' },
                { t: '物', c: 'border-amber-500/20 text-amber-400' },
              ].map(({ t, c }) => (
                <span key={t} className={`px-2.5 py-1 rounded-md border ${c} bg-zinc-900/40 backdrop-blur-sm`}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : (
          /* ===== 激活态：搜索框置顶 + Bento Grid 展开 ===== */
          <div className="flex flex-col gap-5 px-4 md:px-6 pb-12 pt-4 max-w-7xl w-full mx-auto">
            <SearchBar active={true} onSubmit={handleSubmit} />

            {/* B2 面包屑历史回溯（history.length > 1 时由组件自身渲染） */}
            <Breadcrumb onNavigate={handleNavigate} />

            {/* 档案标识条 — 增强版 */}
            <div className="flex items-center gap-3 text-[10px] font-mono tracking-widest text-zinc-600 uppercase animate-fade-in">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
              <span className="text-zinc-500">FILE</span>
              <span className="text-cyan-400/80">{fileNo}</span>
              <span className="text-zinc-700">·</span>
              <span className="text-cyan-400/70 max-w-[200px] truncate">{query}</span>
              <span className="text-zinc-700">·</span>
              <span>情报档案</span>
              {engineMode && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span className={engineMode === 'live' ? 'text-emerald-400 flex items-center gap-1' : 'text-amber-400 flex items-center gap-1'}>
                    <span className={engineMode === 'live' ? 'pulse-dot emerald h-1.5 w-1.5 rounded-full bg-emerald-400 animate-heartbeat' : 'h-1.5 w-1.5 rounded-full bg-amber-400 animate-heartbeat'} />
                    {engineMode === 'live' ? 'LIVE' : 'MOCK'}
                  </span>
                </>
              )}
              <span className="text-zinc-700">·</span>
              <ExportButton fileNo={fileNo} />
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
            </div>

            {/* A3 流式状态指示器 — 仅 searching 阶段 */}
            <StreamingIndicator />

            {/* D3 多视角切换 — 仅在结果阶段显示（组件内部已守卫） */}
            <ViewSwitcher />

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300 animate-fade-in">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{error}</span>
                <button
                  onClick={() => setError(null)}
                  aria-label="关闭错误"
                  className="text-rose-400/70 hover:text-rose-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {phase === 'clarifying' && <ClarifyPanel onPick={handleClarify} />}
            {phase === 'results' && !compareMode && <SourcesPanel />}
            {(phase === 'searching' || phase === 'results') && (
              compareMode ? (
                <CompareView onTagClick={handleTagClick} />
              ) : (
                <BentoGrid onTagClick={handleTagClick} />
              )
            )}

            {/* P0 统一拦截结果态 — 所有风控入口收敛到此视图 */}
            {phase === 'blocked' && blockInfo && (
              <BlockedView
                reason={blockInfo.reason}
                layer={blockInfo.layer}
                query={blockInfo.query}
                inCompare={blockInfo.inCompare}
                compareSide={blockInfo.compareSide}
                onRetry={() => {
                  // 清空拦截态回 idle，SearchBar 文字保留待用户修改
                  useOmniVisionStore.getState().setBlockInfo(null);
                  useOmniVisionStore.getState().setPhase('idle');
                }}
                onHome={() => useOmniVisionStore.getState().reset()}
                onArchive={() => useOmniVisionStore.getState().setArchiveOpen(true)}
              />
            )}
          </div>
        )}
      </main>

      {/* C2 历史档案抽屉 */}
      <ArchiveDrawer onSelect={handleArchiveSelect} />

      {/* 机密档案解封过渡动画 */}
      {transitioning && (
        <ArchiveUnsealTransition
          query={query}
          fileNo={fileNo}
          phase={phase}
          agentProgress={agentProgress}
          agentTimeline={agentTimeline}
          onComplete={() => setTransitioning(false)}
        />
      )}
    </div>
  );
}

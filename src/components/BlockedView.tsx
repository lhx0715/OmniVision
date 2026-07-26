import { ShieldAlert, RotateCcw, Home, Archive, Lock } from 'lucide-react';

/**
 * 统一拦截结果态（P0）
 *
 * 所有风控拦截入口（前端预检 / 后端字典 / 后端 LLM）收敛到此视图，
 * 替代原先"崩溃式拒绝"（一闪即逝 Toast + 弹回首页静止态）。
 *
 * 设计语言：档案查封风格 — FILE SEALED 印章 + 拦截层级标签 + 三个明确出口。
 * 输入框文字由上层保留（store.query 不清空），用户可直接修改搜索词重试。
 */
interface BlockedViewProps {
  reason: string;
  layer: 'dict' | 'llm' | 'frontend';
  query: string;
  inCompare: boolean;
  compareSide?: 'A' | 'B';
  onRetry: () => void;
  onHome: () => void;
  onArchive: () => void;
}

const LAYER_LABELS: Record<BlockedViewProps['layer'], string> = {
  dict: '本地字典拦截',
  llm: '语义风控拦截',
  frontend: '前置预检拦截',
};

export default function BlockedView({
  reason,
  layer,
  query,
  inCompare,
  compareSide,
  onRetry,
  onHome,
  onArchive,
}: BlockedViewProps) {
  return (
    <div className="w-full max-w-2xl mx-auto animate-fade-in">
      <div className="dossier-card corner-brackets scan-line rounded-2xl border border-rose-500/30 bg-zinc-950/60 overflow-hidden relative">
        {/* 顶部条 — 档案查封标识 + 拦截层级标签 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-rose-500/20 bg-rose-500/[0.04]">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-rose-400" />
            <span className="text-[10px] font-mono tracking-[0.3em] text-rose-300/80 uppercase">
              FILE SEALED
            </span>
          </div>
          <span className="text-[10px] font-mono tracking-widest text-rose-400/60 uppercase">
            {LAYER_LABELS[layer]}
          </span>
        </div>

        {/* 主体 — 查封印章 + 被拦截查询词 + 拦截原因 */}
        <div className="px-6 py-10 text-center relative">
          {/* 查封印章 */}
          <div className="relative inline-block mb-6">
            <div className="border-[3px] border-rose-500/80 rounded-lg px-6 py-3 bg-rose-500/10 backdrop-blur-sm shadow-[0_0_50px_rgba(244,63,94,0.3)] archive-stamp-bounce">
              <div className="flex items-center justify-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-400" />
                <span className="text-2xl font-black text-rose-400 tracking-widest">SEALED</span>
              </div>
              <div className="text-[9px] font-mono text-rose-400/70 tracking-[0.3em] mt-0.5">
                ACCESS DENIED
              </div>
            </div>
            <div
              className="absolute -inset-4 border border-rose-500/20 rounded-full animate-ping"
              style={{ animationDuration: '2s' }}
            />
          </div>

          {/* 被拦截查询词 */}
          <div className="text-[10px] font-mono text-zinc-500 tracking-[0.4em] uppercase mb-2">
            QUERY
          </div>
          <div className="text-xl md:text-2xl font-bold text-zinc-300 tracking-wider mb-1 truncate max-w-full">
            {query}
          </div>
          {inCompare && compareSide && (
            <div className="text-[10px] font-mono text-amber-400/70 tracking-widest uppercase mt-1">
              对比模式 · 实体 {compareSide} 触发拦截
            </div>
          )}

          {/* 拦截原因 */}
          <div className="mt-6 mx-auto max-w-md rounded-lg border border-rose-500/15 bg-rose-500/[0.03] px-4 py-3">
            <p className="text-sm text-zinc-300 leading-relaxed">{reason}</p>
          </div>
        </div>

        {/* 出口按钮 — 修改搜索词 / 查看档案库 / 返回首页 */}
        <div className="flex flex-wrap items-center justify-center gap-3 px-6 pb-8">
          <button
            onClick={onRetry}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20"
          >
            <RotateCcw className="h-4 w-4" />
            修改搜索词
          </button>
          <button
            onClick={onArchive}
            className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 transition-colors hover:border-cyan-500/50 hover:bg-cyan-500/20"
          >
            <Archive className="h-4 w-4" />
            查看档案库
          </button>
          <button
            onClick={onHome}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-zinc-200"
          >
            <Home className="h-4 w-4" />
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}

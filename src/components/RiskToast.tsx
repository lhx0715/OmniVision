import { useEffect, useRef } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';

/**
 * 风控拦截 Toast
 *
 * 触发场景：
 *   - 前端本地字典预检命中（layer='frontend'）
 *   - 后端本地字典拦截（layer='dict'）
 *   - 后端 LLM 快审拦截（layer='llm'）
 *
 * 行为：
 *   - 顶部滑入，4 秒后自动消失
 *   - 输入框文字保留（store.query 不清空）
 *   - 可手动关闭
 */
export default function RiskToast() {
  const riskToast = useOmniVisionStore((s) => s.riskToast);
  const setRiskToast = useOmniVisionStore((s) => s.setRiskToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!riskToast) return;

    // 自动消失
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setRiskToast(null);
    }, 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [riskToast, setRiskToast]);

  if (!riskToast) return null;

  const layerLabel =
    riskToast.layer === 'dict'
      ? '本地字典拦截'
      : riskToast.layer === 'llm'
        ? '语义风控拦截'
        : '前置预检拦截';

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] animate-risk-toast-in">
      <div className="flex items-center gap-3 rounded-xl border border-rose-500/40 bg-zinc-950/95 backdrop-blur-md px-4 py-3 shadow-[0_0_30px_rgba(244,63,94,0.15)] min-w-[320px] max-w-[90vw]">
        {/* 左侧图标 — 脉冲警示 */}
        <div className="relative shrink-0">
          <ShieldAlert className="h-5 w-5 text-rose-400" />
          <span className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" style={{ animationDuration: '1.5s' }} />
        </div>

        {/* 中部文案 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-mono tracking-widest text-rose-400/80 uppercase">
              {layerLabel}
            </span>
          </div>
          <p className="text-sm text-zinc-200 leading-snug">
            {riskToast.message}
          </p>
        </div>

        {/* 右侧关闭 */}
        <button
          onClick={() => setRiskToast(null)}
          aria-label="关闭提示"
          className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

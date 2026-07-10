import { useOmniVisionStore } from '@/store/omnivision';

/**
 * A3 流式状态指示器 — 仅在 searching 阶段显示
 * 机密档案风格：mono 字体 + emerald 色调 + 3 个依次闪烁的光点
 */
export default function StreamingIndicator() {
  const phase = useOmniVisionStore((s) => s.phase);

  if (phase !== 'searching') return null;

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

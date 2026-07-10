import { useEffect, useRef, useState } from 'react';

/**
 * A3 数字滚动 hook — 从 0 滚动到 target
 * @param target 目标数值
 * @param duration 滚动时长（ms），默认 800
 * @returns 当前显示的整数
 *
 * target 变化时重新滚动。卸载时清理 requestAnimationFrame。
 */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const fromRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);

    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) {
      setValue(target);
      return;
    }

    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic — 末段放缓，更像仪表读数
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + delta * eased);
      setValue(current);
      fromRef.current = current;
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    startRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

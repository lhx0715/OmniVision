import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface CardEnterWrapperProps {
  children: React.ReactNode;
  /** staggered delay (ms) */
  delay?: number;
}

/**
 * A2 卡片入场包装器 — 触发三阶段入场动画：
 *  1. 角标展开（300ms，由 .corner-brackets 伪元素自带动画驱动）
 *  2. 扫描显现（500ms，clip-path 自上而下揭开 + 扫描线扫过）
 *  3. 数据滑入（400ms，内容从右侧滑入）
 *
 * 动画结束后移除扫描线 DOM 与动画类，避免 clip-path 裁切卡片的 hover box-shadow。
 */
export default function CardEnterWrapper({ children, delay = 0 }: CardEnterWrapperProps) {
  const [showScan, setShowScan] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // 500ms 扫描线动画 + 缓冲后移除 DOM
    const scanTimer = setTimeout(() => setShowScan(false), 600 + delay);
    // 扫描显现(500ms) + 数据滑入(200ms 延迟 + 400ms)全部结束后移除动画类，
    // 恢复 clip-path:none，使卡片 hover 阴影不被裁切
    const doneTimer = setTimeout(() => setDone(true), 650 + delay);
    return () => {
      clearTimeout(scanTimer);
      clearTimeout(doneTimer);
    };
  }, [delay]);

  return (
    <div className="relative h-full">
      {/* 扫描线 */}
      {showScan && (
        <div
          className="card-scan-line"
          style={{ animationDelay: `${delay}ms` }}
        />
      )}
      {/* 扫描显现（clip-path 揭开） */}
      <div
        className={cn('h-full', !done && 'animate-card-enter')}
        style={!done ? { animationDelay: `${delay}ms` } : undefined}
      >
        {/* 数据滑入 */}
        <div
          className={cn('h-full', !done && 'animate-data-enter')}
          style={!done ? { animationDelay: `${delay + 200}ms` } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

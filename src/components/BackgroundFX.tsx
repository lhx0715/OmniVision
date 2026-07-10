import { useEffect, useRef } from 'react';

/**
 * A1 全局背景动效 — 三层叠加
 * 1. 网格底纹（CSS）
 * 2. 扫描线（CSS keyframes，自上而下 8s 循环）
 * 3. 背景粒子（Canvas，20fps 限频，边缘反弹）
 *
 * 三层均 pointer-events-none，置于 -z-10，不拦截交互。
 */
export default function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
      color: string;
    }
    let particles: Particle[] = [];

    const COLORS = [
      'rgba(16, 185, 129, 0.30)', // emerald-400/30
      'rgba(16, 185, 129, 0.20)',
      'rgba(56, 189, 248, 0.20)', // sky-400/20
      'rgba(56, 189, 248, 0.15)',
    ];

    const initParticles = () => {
      // 20-30 个粒子
      const count = 20 + Math.floor(Math.random() * 11);
      particles = Array.from({ length: count }, () => {
        const r = 1 + Math.random(); // 1-2px
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r,
          alpha: 0.1 + Math.random() * 0.2, // 0.1-0.3
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        };
      });
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particles.length === 0) initParticles();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        // 位置更新
        p.x += p.vx;
        p.y += p.vy;
        // 边缘反弹
        if (p.x <= 0 || p.x >= width) p.vx *= -1;
        if (p.y <= 0 || p.y >= height) p.vy *= -1;
        // 绘制小圆点
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const tick = (ts: number) => {
      // 帧率限制到 20fps（每 50ms 更新一次）
      if (ts - lastTs >= 50) {
        lastTs = ts;
        draw();
      }
      rafId = requestAnimationFrame(tick);
    };

    resize();
    rafId = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {/* 网格底纹 */}
      <div className="absolute inset-0 bg-grid" />
      {/* 扫描线 */}
      <div className="absolute inset-x-0 bg-scan-line" />
      {/* 背景粒子 */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

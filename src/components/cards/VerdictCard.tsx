import { useState } from 'react';
import { ShieldCheck, MessageSquare, X, Search } from 'lucide-react';
import type { VerdictCardData } from '@/types';
import BlurText from '@/components/BlurText';
import AskPanel from '@/components/AskPanel';
import { useOmniVisionStore } from '@/store/omnivision';

/** 十字准星 + 同心圆 档案印章 SVG */
function CrosshairSeal() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" fill="none">
      <defs>
        <radialGradient id="sealGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="url(#sealGlow)" />
      {/* 外圈虚线 */}
      <circle cx="60" cy="60" r="54" stroke="#10b981" strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="2 4" />
      <circle cx="60" cy="60" r="44" stroke="#10b981" strokeOpacity="0.5" strokeWidth="1" />
      <circle cx="60" cy="60" r="32" stroke="#10b981" strokeOpacity="0.25" strokeWidth="0.6" />
      {/* 十字准星 */}
      <line x1="60" y1="6" x2="60" y2="22" stroke="#10b981" strokeOpacity="0.6" strokeWidth="1" />
      <line x1="60" y1="98" x2="60" y2="114" stroke="#10b981" strokeOpacity="0.6" strokeWidth="1" />
      <line x1="6" y1="60" x2="22" y2="60" stroke="#10b981" strokeOpacity="0.6" strokeWidth="1" />
      <line x1="98" y1="60" x2="114" y2="60" stroke="#10b981" strokeOpacity="0.6" strokeWidth="1" />
      {/* 中心点 + 脉冲 */}
      <circle cx="60" cy="60" r="4" fill="#10b981" className="animate-pulse-glow" />
      <circle cx="60" cy="60" r="10" stroke="#10b981" strokeOpacity="0.4" strokeWidth="0.8" />
      {/* 刻度 */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 60 + Math.cos(rad) * 48;
        const y1 = 60 + Math.sin(rad) * 48;
        const x2 = 60 + Math.cos(rad) * 52;
        const y2 = 60 + Math.sin(rad) * 52;
        return (
          <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#10b981" strokeOpacity="0.4" strokeWidth="1" />
        );
      })}
    </svg>
  );
}

interface VerdictCardProps {
  data: VerdictCardData;
  /** 点击标签时触发关联搜索（B2） */
  onTagClick?: (tag: string) => void;
}

export default function VerdictCard({ data, onTagClick }: VerdictCardProps) {
  const phase = useOmniVisionStore((s) => s.phase);
  const [showAsk, setShowAsk] = useState(false);

  return (
    <div className="dossier-card corner-brackets scan-line rounded-2xl border border-emerald-500/15 p-6 md:p-8 h-full flex flex-col relative
                    hover:border-emerald-500/40 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-emerald-500/10">
      {/* 背景大编号 */}
      <span className="bg-number text-emerald-500" style={{ top: '-1rem', right: '1rem' }}>01</span>

      {/* 头部条 */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="pulse-dot emerald inline-block h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-emerald-400/90">
            Verdict
          </span>
          <span className="text-[10px] font-mono text-zinc-600">· 全景定性</span>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'results' && (
            <button
              type="button"
              onClick={() => setShowAsk((v) => !v)}
              title={showAsk ? '收起追问' : '追问此卡片'}
              aria-label={showAsk ? '收起追问' : '追问此卡片'}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
            >
              {showAsk ? <X className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
            </button>
          )}
          <span className="classification-stamp text-emerald-400 border-emerald-500/30">
            Top Secret // Verdict
          </span>
        </div>
      </div>

      {/* 主体：左文字 + 右印章 */}
      <div className="relative z-10 mt-5 flex-1 flex flex-col md:flex-row md:items-center gap-6">
        <div className="flex-1 min-w-0">
          <BlurText
            text={data.title}
            delay={30}
            animateBy="words"
            className="text-2xl md:text-[32px] font-black leading-tight text-zinc-50 font-sans tracking-tight"
            stepDuration={0.4}
          />
          {data.subtitle && (
            <p className="mt-3 text-sm md:text-base text-zinc-400 leading-relaxed max-w-2xl">
              {data.subtitle}
            </p>
          )}
        </div>

        {/* 右侧十字准星印章 */}
        <div className="hidden md:block w-[120px] h-[120px] shrink-0 opacity-90">
          <CrosshairSeal />
        </div>
      </div>

      {/* 标签条 */}
      {data.tags && data.tags.length > 0 && (
        <div className="relative z-10 mt-auto pt-5 flex flex-wrap gap-2">
          {data.tags.map((tag, i) => (
            <button
              key={`${tag}-${i}`}
              type="button"
              onClick={() => onTagClick?.(tag)}
              title={onTagClick ? `搜索此标签：${tag}` : tag}
              disabled={!onTagClick}
              className="group/tag relative overflow-hidden rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-1 text-xs text-emerald-300 font-mono transition-all flex items-center gap-1.5 enabled:cursor-pointer enabled:hover:border-emerald-500/60 enabled:hover:bg-emerald-500/15 enabled:hover:text-emerald-200 disabled:cursor-default"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="text-emerald-500/60">#{String(i + 1).padStart(2, '0')}</span>
              <span>{tag}</span>
              <Search className="h-3 w-3 opacity-0 transition-opacity group-hover/tag:opacity-100" />
            </button>
          ))}
        </div>
      )}

      {/* B4 追问面板 */}
      {showAsk && <AskPanel cardType="verdict" />}
    </div>
  );
}

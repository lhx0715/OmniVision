import { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Check, FileText, ScanSearch, Clock } from 'lucide-react';
import type { Phase } from '@/store/omnivision';

interface ArchiveUnsealTransitionProps {
  query: string;
  fileNo: string;
  phase: Phase;
  onComplete: () => void;
}

const SEARCH_TERMS = [
  '检索中...',
  '筛选档案...',
  '交叉比对...',
  '验证来源...',
];

export default function ArchiveUnsealTransition({ query, fileNo, phase, onComplete }: ArchiveUnsealTransitionProps) {
  const [progress, setProgress] = useState(0);
  const [searchIndex, setSearchIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const completedRef = useRef(false);

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    let raf: number;
    let startTime: number | null = null;
    const duration = 2500;

    const animate = (t: number) => {
      if (!startTime) startTime = t;
      const elapsed = t - startTime;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setProgress(Math.round(eased * 100));
      if (p < 1) {
        raf = requestAnimationFrame(animate);
      }
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSearchIndex((prev) => (prev + 1) % SEARCH_TERMS.length);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100 && phase === 'results') {
      const t = setTimeout(() => setShowResult(true), 200);
      return () => clearTimeout(t);
    }
  }, [progress, phase]);

  useEffect(() => {
    if (phase === 'clarifying') {
      setFadingOut(true);
      const t = setTimeout(() => handleComplete(), 400);
      return () => clearTimeout(t);
    }
  }, [phase, handleComplete]);

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
          <div className="w-full max-w-lg">
            <div className="relative mb-8">
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 h-16 bg-zinc-700/50 rounded-r" style={{ opacity: 0.3 + i * 0.2 }} />
                ))}
              </div>
              <div className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 h-16 bg-zinc-700/50 rounded-l" style={{ opacity: 0.3 + i * 0.2 }} />
                ))}
              </div>

              <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl archive-search-card">
                <div className="p-6 md:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[11px] font-mono text-emerald-400/70 tracking-widest uppercase">
                        {SEARCH_TERMS[searchIndex]}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-600">{progress}%</span>
                  </div>

                  <div className="text-center py-6">
                    <div className="text-[10px] font-mono text-zinc-600 tracking-[0.4em] uppercase mb-3">
                      SEARCHING FOR
                    </div>
                    <div className="text-2xl md:text-4xl font-bold text-zinc-200 tracking-wider mb-2">
                      {query}
                    </div>
                  </div>

                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-6">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-400 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[9px] font-mono text-zinc-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      <span>检索中</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3" />
                      <span>扫描档案库</span>
                    </div>
                  </div>
                </div>
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

import { useState } from 'react';
import { ChevronDown, ExternalLink, Database } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

/** 从 URL 提取域名（失败时回退到原 URL） */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function SourcesPanel() {
  const sources = useOmniVisionStore((s) => s.sources);
  const [expanded, setExpanded] = useState(false);
  // A3 数字滚动 — 数据源数量从 0 滚动到 sources.length
  const sourceCount = useCountUp(sources.length);

  if (sources.length === 0) return null;

  // 最多展示 10 条
  const display = sources.slice(0, 10);

  return (
    <div className="corner-brackets rounded-xl border border-emerald-500/15 bg-zinc-900/30 backdrop-blur-sm animate-fade-in overflow-hidden">
      {/* 折叠态头部条 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-emerald-500/[0.04]"
      >
        <Database className="h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">
          Sources
        </span>
        <span className="shrink-0 text-zinc-700">·</span>
        <span className="shrink-0 text-[11px] font-mono text-zinc-400">
          基于 <span className="text-emerald-400">{sourceCount}</span> 个数据源生成
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-zinc-600 group-hover:text-emerald-400/80 transition-colors">
          {expanded ? '收起' : '展开'}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-300',
              expanded && 'rotate-180',
            )}
          />
        </span>
      </button>

      {/* 展开态：来源列表 */}
      {expanded && (
        <div className="border-t border-emerald-500/10 px-4 py-3">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {display.map((src, i) => {
              const hostname = extractHostname(src.url);
              return (
                <li key={`${src.url}-${i}`} className="min-w-0">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={src.title}
                    className="group/src flex items-start gap-2 text-[10px] font-mono leading-relaxed transition-colors"
                  >
                    <span className="shrink-0 text-emerald-400/90">
                      S{String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-zinc-300 group-hover/src:text-emerald-300 transition-colors">
                        {src.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-zinc-600 group-hover/src:text-zinc-500 transition-colors">
                        <span className="truncate">{hostname}</span>
                        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50 group-hover/src:opacity-100" />
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          {sources.length > display.length && (
            <p className="mt-3 text-[9px] font-mono uppercase tracking-widest text-zinc-700">
              + {sources.length - display.length} 个来源未展示
            </p>
          )}
        </div>
      )}
    </div>
  );
}

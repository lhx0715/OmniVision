/**
 * 底部关系追问框（PRD-02 FR-07）
 *
 * 针对选中节点追问，SSE 流式并入图。
 * 无选中节点时提示先选节点。
 */
import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';
import { useExploreStore } from '@/store/explore';
import { cn } from '@/lib/utils';

const STAGE_LABELS: Record<string, string> = {
  planning: '规划追问方向',
  searching: '多源检索中',
  extracting: '抽取关系三元组',
  merging: '并入探索图谱',
  done: '完成',
};

const SUGGESTIONS = [
  '它的主要竞争对手有哪些？',
  '这件事的后续影响是什么？',
  '背后的关键人物是谁？',
  '它依赖哪些核心技术/供应链？',
];

export default function AskDockPanel() {
  const selectedNodeId = useExploreStore((s) => s.selectedNodeId);
  const nodes = useExploreStore((s) => s.nodes);
  const askLoading = useExploreStore((s) => s.askLoading);
  const askStage = useExploreStore((s) => s.askStage);
  const lastAnswerSummary = useExploreStore((s) => s.lastAnswerSummary);
  const lastSources = useExploreStore((s) => s.lastSources);
  const currentSession = useExploreStore((s) => s.currentSession);
  const askRelation = useExploreStore((s) => s.askRelation);

  const [question, setQuestion] = useState('');
  const [showSources, setShowSources] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  useEffect(() => {
    if (selectedNodeId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedNodeId]);

  const handleSubmit = async () => {
    if (!selectedNodeId || !question.trim() || !currentSession || askLoading) return;
    const q = question.trim();
    setQuestion('');
    await askRelation(currentSession.id, selectedNodeId, q);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-violet-500/15 bg-zinc-950/95 backdrop-blur-xl">
      {/* 上方：追问摘要 + 来源（追问完成后展示） */}
      {lastAnswerSummary && !askLoading && (
        <div className="px-4 pt-3 pb-1 max-h-32 overflow-y-auto">
          <div className="flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-300 leading-relaxed">{lastAnswerSummary}</p>
              {lastSources.length > 0 && (
                <button
                  onClick={() => setShowSources((v) => !v)}
                  className="mt-1 flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-violet-300 transition-colors"
                >
                  {showSources ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                  来源 ({lastSources.length})
                </button>
              )}
              {showSources && (
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                  {lastSources.slice(0, 6).map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-violet-300 transition-colors truncate"
                    >
                      <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
                      <span className="truncate">{s.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 追问输入区 */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          {/* 选中节点标签 */}
          <div className="flex items-center gap-1.5 shrink-0 rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-2.5 py-1.5">
            <span className="text-[9px] font-mono uppercase tracking-widest text-violet-400/60">
              追问
            </span>
            <span className="text-xs text-violet-200 font-medium max-w-[120px] truncate">
              {selectedNode?.label || '未选中'}
            </span>
          </div>

          {/* 输入框 */}
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-1.5 focus-within:border-violet-500/40 focus-within:shadow-[0_0_20px_rgba(139,92,246,0.12)] transition-all">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!selectedNodeId || askLoading}
              placeholder={
                !selectedNodeId
                  ? '先点击图中节点，再追问关系…'
                  : askLoading
                    ? '正在追问…'
                    : `针对「${selectedNode?.label}」追问关系…`
              }
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 font-mono outline-none tracking-wider"
            />
            {askLoading && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-violet-400/70 shrink-0">
                <Loader2 className="h-3 w-3 animate-spin" />
                {askStage ? STAGE_LABELS[askStage] || askStage : '处理中'}
              </span>
            )}
          </div>

          {/* 发送按钮 */}
          <button
            onClick={handleSubmit}
            disabled={!selectedNodeId || !question.trim() || askLoading}
            className={cn(
              'shrink-0 flex items-center justify-center rounded-lg px-3 py-1.5 transition-all',
              selectedNodeId && question.trim() && !askLoading
                ? 'bg-violet-500/20 border border-violet-500/40 text-violet-200 hover:bg-violet-500/30 hover:shadow-[0_0_16px_rgba(139,92,246,0.3)]'
                : 'bg-zinc-800/40 border border-white/5 text-zinc-600 cursor-not-allowed',
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 快捷建议 */}
        {!askLoading && selectedNodeId && !lastAnswerSummary && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-700">
              建议
            </span>
            {SUGGESTIONS.map((sug) => (
              <button
                key={sug}
                onClick={() => setQuestion(sug)}
                className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] font-mono text-zinc-500 hover:text-violet-300 hover:border-violet-500/20 transition-colors"
              >
                {sug}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

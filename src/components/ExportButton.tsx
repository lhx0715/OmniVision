import { useState } from 'react';
import { Download, AlertCircle } from 'lucide-react';
import { useOmniVisionStore } from '@/store/omnivision';
import { cn } from '@/lib/utils';
import { generateReportHTML } from '@/lib/exportReport';

interface ExportButtonProps {
  /** 档案编号（由 Home 页生成） */
  fileNo: string;
}

export default function ExportButton({ fileNo }: ExportButtonProps) {
  const phase = useOmniVisionStore((s) => s.phase);
  const [error, setError] = useState<string | null>(null);

  if (phase !== 'results') return null;

  const handleExport = () => {
    setError(null);
    try {
      const state = useOmniVisionStore.getState();
      const html = generateReportHTML({
        fileNo,
        query: state.query,
        entityType: state.entityType,
        cards: state.cards,
        sources: state.sources,
      });

      // 用 Blob + 临时 <a> 直接下载 HTML 文件，避免弹窗被拦截
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OmniVision_${fileNo}_${state.query || 'report'}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 释放 URL 对象
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('导出失败，请重试');
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleExport}
        title="导出情报报告（打印版）"
        aria-label="导出情报报告"
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/5',
          'px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase text-cyan-300',
          'transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/15 hover:text-cyan-200',
        )}
      >
        <Download className="h-2.5 w-2.5" />
        导出报告
      </button>
      {error && (
        <span
          className="inline-flex items-center gap-1 text-[9px] font-mono text-rose-400 animate-fade-in"
          role="alert"
        >
          <AlertCircle className="h-2.5 w-2.5" />
          {error}
        </span>
      )}
    </span>
  );
}

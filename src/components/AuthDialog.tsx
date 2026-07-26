import { useState, type FormEvent, useEffect } from 'react';
import { X, Fingerprint, Mail, Lock, User, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  /** 登录/注册成功后回调 */
  onSuccess?: () => void;
}

/**
 * 注册/登录弹窗 — 机密档案室准入风格
 *
 * 设计语言：
 *   - 暗色卡片 + emerald 辉光（与全站一致）
 *   - 角标括号装饰（corner-brackets）
 *   - 等宽字体标签 + 档案编号感
 *   - 表单字段带左侧图标，聚焦时 emerald 描边
 *   - 成功时有 stamp 盖章动效
 */
export default function AuthDialog({ open, onClose, onSuccess }: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAuth = useAuthStore((s) => s.setAuth);

  // 重置表单
  useEffect(() => {
    if (open) {
      setError(null);
      setLoading(false);
    }
  }, [open, mode]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { email, password }
          : { email, password, displayName: displayName.trim() || undefined };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '操作失败，请重试');
        return;
      }

      setAuth(data.user, data.token);
      onSuccess?.();
      onClose();
      // 清空密码
      setPassword('');
    } catch {
      setError('网络异常，请检查连接后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
      {/* 遮罩 */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md animate-fade-in"
      />

      {/* 弹窗主体 */}
      <div className="relative w-full max-w-md animate-auth-dialog-in">
        <div className="dossier-card corner-brackets rounded-2xl border border-emerald-500/20 bg-zinc-950/95 backdrop-blur-xl shadow-[0_0_60px_rgba(16,185,129,0.1)]">
          {/* 顶部标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <Fingerprint className="h-4 w-4 text-emerald-400" />
              <h2 className="font-mono text-sm tracking-[0.25em] text-zinc-200 uppercase">
                {mode === 'login' ? '档案室准入' : '档案登记'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/5 text-zinc-500 transition-colors hover:text-zinc-200 hover:border-white/15"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 副标题 */}
          <div className="px-6 pt-4 pb-2">
            <p className="text-[11px] font-mono text-zinc-600 tracking-wider">
              {mode === 'login'
                ? 'ACCESS VERIFICATION · 验证身份以访问个人知识库'
                : 'NEW REGISTRATION · 创建档案以开始知识沉淀'}
            </p>
          </div>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-3 space-y-3">
            {/* 注册时显示昵称 */}
            {mode === 'register' && (
              <div className="relative">
                <label className="block text-[10px] font-mono text-zinc-500 tracking-wider uppercase mb-1.5">
                  代号 / Agent Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="可选，默认使用邮箱"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-10 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/40 focus:bg-emerald-500/[0.03]"
                  />
                </div>
              </div>
            )}

            {/* 邮箱 */}
            <div className="relative">
              <label className="block text-[10px] font-mono text-zinc-500 tracking-wider uppercase mb-1.5">
                通讯地址 / Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="agent@omnivision.io"
                  autoComplete="email"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-10 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/40 focus:bg-emerald-500/[0.03]"
                />
              </div>
            </div>

            {/* 密码 */}
            <div className="relative">
              <label className="block text-[10px] font-mono text-zinc-500 tracking-wider uppercase mb-1.5">
                密钥 / Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-10 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/40 focus:bg-emerald-500/[0.03]"
                />
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.04] px-3 py-2 text-xs text-rose-300 animate-fade-in">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-mono tracking-wider uppercase transition-all',
                loading
                  ? 'border-white/10 text-zinc-600 cursor-wait'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50',
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  验证中...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  {mode === 'login' ? '准入' : '建档'}
                </>
              )}
            </button>
          </form>

          {/* 模式切换 */}
          <div className="px-6 pb-5 text-center">
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-[11px] font-mono text-zinc-500 hover:text-emerald-400 transition-colors tracking-wider"
            >
              {mode === 'login'
                ? '没有档案？点击登记 →'
                : '← 已有档案？直接准入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

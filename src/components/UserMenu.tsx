import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Fingerprint, LogOut, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import AuthDialog from '@/components/AuthDialog';

interface UserMenuProps {
  /** 是否监听全局 'omnivision:auth-required' 事件自动打开登录弹窗，默认 true。
   *  任意页面的"收藏"等操作通过 dispatchEvent 触发该事件，UserMenu 自动弹出登录框。 */
  listenAuthRequired?: boolean;
}

/**
 * 用户菜单 — 全局共享的认证入口
 *
 * 两种状态：
 *   - 未登录：渲染"登录 / 注册"按钮，点击打开 AuthDialog
 *   - 已登录：渲染头像 + 下拉菜单（邮箱 + 退出登录）
 *
 * 下拉菜单通过 React Portal 渲染到 document.body，z-index 提到 z-[200]，
 * 避免被页面 main 内容区的 stacking context 遮挡（各页面 header 与 main 同为 z-10，
 * main 后渲染会盖住 header 内的下拉菜单，导致退出登录按钮点不到）。
 *
 * 视觉沿用机密档案室风格（emerald 辉光、等宽字体标签）。
 */
export default function UserMenu({ listenAuthRequired = true }: UserMenuProps) {
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  // 监听收藏等操作触发的登录引导事件
  useEffect(() => {
    if (!listenAuthRequired) return;
    const handler = () => setAuthOpen(true);
    window.addEventListener('omnivision:auth-required', handler);
    return () => window.removeEventListener('omnivision:auth-required', handler);
  }, [listenAuthRequired]);

  // 打开菜单时根据头像按钮位置计算下拉坐标（fixed 定位，右对齐头像）
  const openMenu = () => {
    const btn = btnRef.current;
    if (btn) {
      const r = btn.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setMenuOpen(true);
  };

  // 菜单打开期间，滚动/缩放关闭菜单（fixed 定位不跟随按钮）
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  return (
    <>
      {authUser ? (
        <button
          ref={btnRef}
          type="button"
          onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
          className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
        >
          <span className="h-4 w-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 grid place-items-center text-[8px] text-emerald-300">
            {(authUser.displayName || authUser.email)[0].toUpperCase()}
          </span>
          <span className="hidden sm:inline max-w-[80px] truncate">
            {authUser.displayName || authUser.email.split('@')[0]}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20"
        >
          <Fingerprint className="h-3 w-3" />
          <span>登录 / 注册</span>
          <ChevronRight className="h-3 w-3" />
        </button>
      )}

      {/* 下拉菜单通过 Portal 渲染到 body，脱离 header 的 stacking context，
          避免被 main 内容区遮挡，确保退出登录按钮可点击 */}
      {menuOpen &&
        authUser &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[200]"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className="fixed z-[201] w-48 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur-xl py-1 shadow-xl animate-fade-in"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              <div className="px-3 py-2 border-b border-white/[0.06]">
                <p className="text-[10px] text-zinc-600 font-mono tracking-wider uppercase">已认证</p>
                <p className="text-xs text-zinc-300 truncate mt-0.5">{authUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:text-rose-300 hover:bg-rose-500/[0.04] transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                退出登录
              </button>
            </div>
          </>,
          document.body,
        )}

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}

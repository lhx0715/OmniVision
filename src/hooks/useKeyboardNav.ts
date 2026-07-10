import { useEffect, useRef } from 'react';
import {
  useOmniVisionStore,
  ALL_CARD_TYPES,
  EXPANDABLE_CARDS,
} from '@/store/omnivision';

/** 判断当前活动元素是否处于可编辑状态（input/textarea/contentEditable） */
function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * B5 全局键盘快捷键导航。
 *
 * - `1`~`5`：跳转到对应卡片（按 ALL_CARD_TYPES 顺序），高亮闪烁 2 秒
 * - `E`：展开/收起当前聚焦卡片（仅对 EXPANDABLE_CARDS 生效）
 * - `Q`：聚焦搜索框
 * - `Esc`：关闭浮层/收起卡片/退出聚焦模式
 * - `←`/`→`：在时间线节点间切换
 *
 * 规则：
 * 1. 输入框聚焦时，除 `Esc` 外所有按键均被忽略
 * 2. `Q` 在任何 phase 下都生效（只要不在输入框中）；其余按键仅在 `phase === 'results'` 时生效
 * 3. 卡片高亮闪烁：设置 focusedCardIndex 后 2 秒自动清空
 */
export function useKeyboardNav() {
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearFocusTimer = () => {
      if (focusTimerRef.current !== null) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const store = useOmniVisionStore.getState();
      const editing = isEditable(document.activeElement);
      const key = e.key;

      // Esc：始终生效（即便在输入框中）
      if (key === 'Escape') {
        if (editing && document.activeElement) {
          (document.activeElement as HTMLElement).blur();
        }
        clearFocusTimer();
        store.setFocusedCardIndex(null);
        store.setExpandedCard(null);
        store.setFocusedTimelineIndex(null);
        return;
      }

      // 其余按键：输入框聚焦时忽略
      if (editing) return;

      // Q：聚焦搜索框，任何 phase 下都生效
      if (key === 'q' || key === 'Q') {
        const input = document.querySelector(
          'input[aria-label="搜索查询"]',
        ) as HTMLInputElement | null;
        input?.focus();
        return;
      }

      // 其余快捷键仅在结果展示阶段生效
      if (store.phase !== 'results') return;

      // 1~5：跳转对应卡片
      if (key >= '1' && key <= '5') {
        const idx = Number(key) - 1;
        if (idx >= ALL_CARD_TYPES.length) return;
        clearFocusTimer();
        store.setFocusedCardIndex(idx);
        focusTimerRef.current = setTimeout(() => {
          useOmniVisionStore.getState().setFocusedCardIndex(null);
          focusTimerRef.current = null;
        }, 2000);
        return;
      }

      // E：展开/收起当前聚焦卡片
      if (key === 'e' || key === 'E') {
        const idx = store.focusedCardIndex;
        if (idx === null) return;
        const cardType = ALL_CARD_TYPES[idx];
        if (!EXPANDABLE_CARDS.includes(cardType)) return;
        store.setExpandedCard(store.expandedCard === cardType ? null : cardType);
        return;
      }

      // ←/→：时间线节点切换
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const timelineCard = store.cards.timeline;
        if (!timelineCard || !('events' in timelineCard)) return;
        const events = timelineCard.events;
        if (!events || events.length === 0) return;
        e.preventDefault();
        const max = events.length - 1;
        const current = store.focusedTimelineIndex;
        let next: number;
        if (current === null) {
          next = 0;
        } else if (key === 'ArrowLeft') {
          next = Math.max(0, current - 1);
        } else {
          next = Math.min(max, current + 1);
        }
        store.setFocusedTimelineIndex(next);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearFocusTimer();
    };
  }, []);
}

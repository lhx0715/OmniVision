import { useCallback, useRef } from 'react';
import { useOmniVisionStore } from '@/store/omnivision';
import type { CardType, CardData } from '@/types';

/** expand / ask 端点共用的 SSE 事件结构 */
interface StreamEvent {
  loading?: boolean;
  chunk?: string;
  done?: boolean;
  error?: string;
}

/** 从一段原始 SSE 事件文本中提取 data JSON，忽略注释 / 心跳行（':' 开头） */
function parseEvent(rawEvent: string): StreamEvent | null {
  const lines = rawEvent.split('\n');
  let dataStr = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) continue;
    if (trimmed.startsWith('data:')) {
      dataStr += trimmed.slice(5).trim();
    } else if (trimmed.startsWith('data')) {
      dataStr += trimmed.slice(4).trim();
    }
  }
  if (!dataStr) return null;
  try {
    return JSON.parse(dataStr) as StreamEvent;
  } catch {
    return null;
  }
}

/** 通用 SSE 流消费：fetch + ReadableStream，按 \n\n 分割事件逐条回调 */
async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (evt: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const evt = parseEvent(rawEvent);
      if (evt) onEvent(evt);
    }
  }

  // 流末尾残留
  buffer += decoder.decode();
  if (buffer.trim()) {
    const evt = parseEvent(buffer);
    if (evt) onEvent(evt);
  }
}

/**
 * B1 卡片深度展开
 * 返回 { expand, cancel }
 * expand: 设置展开状态 → 流式拉取 /api/expand → 逐 chunk 写入 store
 */
export function useExpand() {
  const abortRef = useRef<AbortController | null>(null);

  const expand = useCallback(async (cardType: CardType, payload: CardData) => {
    // 终止上一次未完成的展开
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const store = useOmniVisionStore.getState();
    const { query, entityType } = store;
    if (!query || !entityType) {
      store.setExpansion(cardType, { loading: false, content: '缺少查询上下文，无法展开' });
      return;
    }

    store.setExpandedCard(cardType);
    store.setExpansion(cardType, { loading: true, content: '' });

    let content = '';
    try {
      const res = await fetch('/api/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ cardType, payload, query, entityType }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`请求失败：HTTP ${res.status}`);
      }

      await consumeSSE(res.body, (evt) => {
        if (evt.error) {
          throw new Error(evt.error);
        }
        if (typeof evt.chunk === 'string') {
          content += evt.chunk;
          useOmniVisionStore.getState().setExpansion(cardType, { content });
          return;
        }
        if (evt.done) {
          useOmniVisionStore.getState().setExpansion(cardType, { loading: false });
        }
        // evt.loading === false 表示流已开始，无需处理
      });
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      useOmniVisionStore.getState().setExpansion(cardType, {
        loading: false,
        content: content || (aborted ? '已取消' : '加载失败'),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { expand, cancel };
}

/**
 * B4 卡片追问
 * 返回 { ask, cancel }
 * ask: 写入问题 → 流式拉取 /api/ask → 逐 chunk 拼接 answer
 */
export function useAsk() {
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(async (cardType: CardType, payload: CardData, question: string) => {
    if (!question.trim()) return;
    // 终止上一次未完成的追问
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const store = useOmniVisionStore.getState();
    const { query } = store;
    if (!query) {
      store.setAsk(cardType, { loading: false, answer: '缺少查询上下文，无法追问' });
      return;
    }

    store.setAsk(cardType, { question, answer: '', loading: true });

    let answer = '';
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ cardType, payload, query, question }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`请求失败：HTTP ${res.status}`);
      }

      await consumeSSE(res.body, (evt) => {
        if (evt.error) {
          throw new Error(evt.error);
        }
        if (typeof evt.chunk === 'string') {
          answer += evt.chunk;
          useOmniVisionStore.getState().setAsk(cardType, { answer });
          return;
        }
        if (evt.done) {
          useOmniVisionStore.getState().setAsk(cardType, { loading: false });
        }
      });
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      useOmniVisionStore.getState().setAsk(cardType, {
        loading: false,
        answer: answer || (aborted ? '已取消' : '加载失败'),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { ask, cancel };
}

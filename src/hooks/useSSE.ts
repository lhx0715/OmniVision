import { useCallback, useRef } from 'react';
import { useOmniVisionStore, ALL_CARD_TYPES } from '@/store/omnivision';
import type {
  CardType,
  CardData,
  EntityType,
  ClarifyOption,
  IntelSource,
  SourceStats,
} from '@/types';

interface SSEEvent {
  type?: string;
  engine?: 'live' | 'mock';
  needsClarify?: boolean;
  done?: boolean;
  error?: boolean;
  blocked?: boolean;
  reason?: string;
  layer?: 'dict' | 'llm';
  options?: ClarifyOption[];
  cardType?: CardType;
  payload?: CardData;
  entityType?: EntityType;
  message?: string;
  sources?: IntelSource[];
  images?: string[];
  // PRD-01 M3：信源构成统计
  source_stats?: SourceStats;
  chunk?: string;
  // Agent 进度事件
  step?: number;
  maxSteps?: number;
  thought?: string;
  stage?: 'thinking' | 'searching' | 'observing' | 'finalizing';
  searchQuery?: string;
  searchFocus?: string;
  quality?: 'sufficient' | 'partial' | 'insufficient';
  gaps?: string[];
  newSources?: { title: string; url: string }[];
  newFacts?: { content: string; category: string }[];
  coveredDimensions?: string[];
  sourcesCount?: number;
  factsCount?: number;
  bySource?: Record<string, number>;
}

/** 从单条 SSE 事件的原始文本中提取并解析 JSON 数据 */
function parseSSEData(rawEvent: string): Record<string, unknown> | null {
  const lines = rawEvent.split('\n');
  let dataStr = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      dataStr += trimmed.slice(5).trim();
    } else if (trimmed.startsWith('data')) {
      dataStr += trimmed.slice(4).trim();
    }
  }
  if (!dataStr) return null;

  try {
    return JSON.parse(dataStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 解析单条 SSE 事件并写入 store
 * @param target 'A' = 主实体（默认），'B' = 对比模式第二实体
 * @param onProgress 收到有意义事件（非心跳/非解析失败）时的回调，用于看门狗计时
 */
function handleEvent(
  rawEvent: string,
  target: 'A' | 'B' = 'A',
  onProgress?: () => void,
) {
  const parsed = parseSSEData(rawEvent);
  if (!parsed) return;
  // 已确认是真实 data 事件（非 ':' 心跳），通知看门狗重置 stall 计时
  onProgress?.();

  const evt = parsed as unknown as SSEEvent;
  const store = useOmniVisionStore.getState();
  // 守卫：已进入拦截结果态后，丢弃后续残留 SSE 事件（如对比模式另一侧的流）
  if (store.phase === 'blocked') return;
  const inCompare = store.compareMode;

  // 引擎模式标识（live = 大模型实时搜索 / mock = 本地知识库）
  if (evt.engine) {
    store.setEngineMode(evt.engine);
    return;
  }

  // Agent 进度事件 — ReAct 多轮研究的每一步
  // 前端过渡动画据此动态更新进度条，不再写死
  // 对比模式 B 路忽略：全屏载体只跟 A 路，避免双路 timeline 互相覆盖
  if (evt.type === 'agent_step' && typeof evt.step === 'number' && typeof evt.maxSteps === 'number') {
    if (target === 'B') return;
    store.setAgentProgress({
      step: evt.step,
      maxSteps: evt.maxSteps,
      thought: evt.thought ?? '',
      stage: evt.stage,
      searchQuery: evt.searchQuery,
      searchFocus: evt.searchFocus,
      quality: evt.quality,
      gaps: evt.gaps,
      newSources: evt.newSources,
      newFacts: evt.newFacts,
      coveredDimensions: evt.coveredDimensions,
      sourcesCount: evt.sourcesCount,
      factsCount: evt.factsCount,
      bySource: evt.bySource,
      timestamp: Date.now(),
    });
    return;
  }

  // 风控拦截 — 命中本地字典或 LLM 快审，统一导向 blocked 结果态（P0）
  // 保留输入框文字（query 不清空），渲染 BlockedView 档案查封页，提供明确退出路径
  if (evt.blocked === true) {
    const s = useOmniVisionStore.getState();
    s.setBlockInfo({
      reason: evt.reason ?? '输入内容包含敏感或受限主题，请修改后重试',
      layer: evt.layer ?? 'llm',
      query: s.query,
      inCompare: s.compareMode,
      compareSide: s.compareMode ? target : undefined,
      timestamp: Date.now(),
    });
    s.setStreamingCards([]);
    s.setStreamingCardsB([]);
    s.setCompareMode(false);
    s.resetAgentTimeline();
    s.setPhase('blocked');
    return;
  }

  // C4 数据源溯源
  if (evt.sources) {
    if (target === 'A') store.setSources(evt.sources);
    else store.setSourcesB(evt.sources);
    return;
  }

  // PRD-01 M3：信源构成统计（深度感知展示）
  if (evt.source_stats) {
    if (target === 'A') store.setSourceStats(evt.source_stats);
    return;
  }

  // 影像档案 — Tavily 返回的图片 URL 列表（仅主实体推送，对比模式不展示 gallery）
  if (evt.images) {
    store.setImages(evt.images);
    return;
  }

  if (evt.type === 'clarify' || evt.needsClarify === true) {
    // 对比模式下忽略澄清请求，该实体将无卡片
    if (inCompare) return;
    store.setClarifyOptions(evt.options ?? []);
    store.setStreamingCards([]);
    store.setPhase('clarifying');
    return;
  }

  if ((evt.type === 'card' || evt.cardType) && evt.payload) {
    if (evt.entityType) {
      if (target === 'A') store.setEntityType(evt.entityType);
      else store.setEntityTypeB(evt.entityType);
    }
    if (target === 'A') store.addCard(evt.cardType as CardType, evt.payload as CardData);
    else store.addCardB(evt.cardType as CardType, evt.payload as CardData);
    return;
  }

  if (evt.type === 'done' || evt.done === true) {
    if (evt.entityType) {
      if (target === 'A') store.setEntityType(evt.entityType);
      else store.setEntityTypeB(evt.entityType);
    }
    if (target === 'A') store.setStreamingCards([]);
    else store.setStreamingCardsB([]);
    // 对比模式下 phase 由 startCompare 统一管理
    if (!inCompare) {
      store.setPhase('results');
    }
    return;
  }

  if (evt.type === 'error' || evt.error === true) {
    store.setError(evt.message ?? '未知错误');
    if (target === 'A') {
      store.setStreamingCards([]);
      store.resetAgentTimeline();
    } else {
      store.setStreamingCardsB([]);
    }
    if (!inCompare) {
      store.setPhase('idle');
    }
    return;
  }
}

/** 消费 SSE buffer：按 \n\n 分割事件并逐条处理，返回剩余未完成的片段 */
function consumeBuffer(
  buffer: string,
  target: 'A' | 'B',
  onProgress?: () => void,
): string {
  let remaining = buffer;
  let sep: number;
  while ((sep = remaining.indexOf('\n\n')) !== -1) {
    const rawEvent = remaining.slice(0, sep);
    remaining = remaining.slice(sep + 2);
    handleEvent(rawEvent, target, onProgress);
  }
  return remaining;
}

/** 读取 SSE 流直到结束，返回剩余 buffer */
async function readSSEStream(
  res: Response,
  target: 'A' | 'B',
  onBuffer?: (remaining: string) => void,
  onProgress?: () => void,
): Promise<void> {
  const body = res.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = consumeBuffer(buffer, target, onProgress);
  }

  // 处理流末尾残留内容
  buffer += decoder.decode();
  if (buffer.trim()) {
    handleEvent(buffer, target, onProgress);
  }
  onBuffer?.(buffer);
}

/**
 * 通过 fetch + ReadableStream 解析 SSE 流（POST 请求无法使用 EventSource）。
 * 返回 start / startCompare / abort 三个方法。
 */
export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);
  const completedRef = useRef<boolean>(true);
  // 看门狗：watchdogFiredRef 标记是否由看门狗触发的 abort（区别于用户主动 abort）
  const watchdogFiredRef = useRef<boolean>(false);

  const start = useCallback(async (query: string, entityType?: EntityType) => {
    // 仅终止未完成的请求，避免对已完成的请求触发 ERR_ABORTED
    if (abortRef.current && !completedRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    completedRef.current = false;
    watchdogFiredRef.current = false;

    const store = useOmniVisionStore.getState();
    store.setError(null);
    store.clearCards();
    store.setCompareMode(false);
    store.setPhase('searching');
    store.setStreamingCards([...ALL_CARD_TYPES]);
    store.resetAgentTimeline();
    store.setSourceStats(null);

    // ===== 流式看门狗 =====
    // 后端心跳（': keepalive'）不计入进度；仅真实 data 事件更新 lastEventTime。
    // 60s 无任何真实事件 = 后端 stall（如 LLM 调用挂起未被超时兜底），主动 abort 并回 idle。
    const STALL_TIMEOUT_MS = 60000;
    const lastEventAt = { time: Date.now() };
    const onProgress = () => {
      lastEventAt.time = Date.now();
    };
    const watchdog = setInterval(() => {
      if (Date.now() - lastEventAt.time > STALL_TIMEOUT_MS) {
        console.warn(`[sse] 搜索 ${STALL_TIMEOUT_MS / 1000}s 无进度事件，判定后端 stall，主动中断`);
        watchdogFiredRef.current = true;
        const s = useOmniVisionStore.getState();
        s.setError('搜索超时，请重试');
        s.setStreamingCards([]);
        s.resetAgentTimeline();
        s.setPhase('idle');
        controller.abort();
      }
    }, 5000);

    let buffer = '';

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ query, entityType }),
        signal: controller.signal,
      });

      const body = res.body;
      if (!res.ok || !body) {
        throw new Error(`请求失败：HTTP ${res.status}`);
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          handleEvent(rawEvent, 'A', onProgress);
        }
      }

      // 处理流末尾残留内容
      buffer += decoder.decode();
      if (buffer.trim()) {
        handleEvent(buffer, 'A', onProgress);
      }
    } catch (err) {
      // 看门狗触发的 abort：已在看门狗里完成 error/phase 处理，这里只收尾
      if (watchdogFiredRef.current) {
        completedRef.current = true;
        return;
      }
      if ((err as Error).name === 'AbortError') {
        completedRef.current = true;
        return;
      }
      completedRef.current = true;
      const s = useOmniVisionStore.getState();
      s.setError((err as Error).message ?? '网络异常');
      s.setStreamingCards([]);
      s.setPhase('idle');
    } finally {
      clearInterval(watchdog);
      completedRef.current = true;
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, []);

  /**
   * C1 双实体对比模式
   * 1. 并发发起两个 /api/search 请求
   * 2. 两个请求的 SSE 事件分别写入 A / B 组
   * 3. 两个请求都完成后，调用 /api/compare 生成对比摘要
   */
  const startCompare = useCallback(async (queryA: string, queryB: string) => {
    if (abortRef.current && !completedRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    completedRef.current = false;
    watchdogFiredRef.current = false;

    const store = useOmniVisionStore.getState();
    store.setError(null);
    store.clearCards();
    store.clearCardsB();
    store.setCompareMode(true);
    store.setCompareQuery(queryA, queryB);
    store.setCompareSummary('');
    store.setCompareSummaryLoading(false);
    store.setPhase('searching');
    store.setStreamingCards([...ALL_CARD_TYPES]);
    store.setStreamingCardsB([...ALL_CARD_TYPES]);
    store.setAgentProgress(null);

    // ===== 流式看门狗（同 start：60s 无真实事件判定 stall）=====
    const STALL_TIMEOUT_MS = 60000;
    const lastEventAt = { time: Date.now() };
    const onProgress = () => {
      lastEventAt.time = Date.now();
    };
    const watchdog = setInterval(() => {
      if (Date.now() - lastEventAt.time > STALL_TIMEOUT_MS) {
        console.warn(`[sse] 对比搜索 ${STALL_TIMEOUT_MS / 1000}s 无进度事件，判定后端 stall，主动中断`);
        watchdogFiredRef.current = true;
        const s = useOmniVisionStore.getState();
        s.setError('搜索超时，请重试');
        s.setStreamingCards([]);
        s.setStreamingCardsB([]);
        s.resetAgentTimeline();
        s.setPhase('idle');
        controller.abort();
      }
    }, 5000);

    try {
      // 并发发起两个搜索请求
      const [resA, resB] = await Promise.all([
        fetch('/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ query: queryA }),
          signal: controller.signal,
        }),
        fetch('/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ query: queryB }),
          signal: controller.signal,
        }),
      ]);

      if (!resA.ok || !resA.body || !resB.ok || !resB.body) {
        const status = !resA.ok ? resA.status : resB.status;
        throw new Error(`请求失败：HTTP ${status}`);
      }

      // 并发消费两个 SSE 流（allSettled：单个失败不阻断另一个）
      await Promise.allSettled([
        readSSEStream(resA, 'A', undefined, onProgress),
        readSSEStream(resB, 'B', undefined, onProgress),
      ]);

      // 看门狗触发 → 已回 idle，直接收尾
      if (watchdogFiredRef.current) {
        return;
      }

      // 某一侧被风控拦截 → 已进入 blocked 结果态，短路跳过对比摘要生成
      const state = useOmniVisionStore.getState();
      if (state.phase === 'blocked') {
        return;
      }

      // 两个搜索都完成后，生成对比摘要
      if (
        Object.keys(state.cards).length > 0 ||
        Object.keys(state.cardsB).length > 0
      ) {
        await generateCompareSummary(queryA, queryB, controller.signal);
      }

      useOmniVisionStore.getState().setPhase('results');
    } catch (err) {
      // 看门狗触发的 abort：已处理 error/phase，只收尾
      if (watchdogFiredRef.current) {
        completedRef.current = true;
        return;
      }
      if ((err as Error).name === 'AbortError') {
        completedRef.current = true;
        return;
      }
      completedRef.current = true;
      const s = useOmniVisionStore.getState();
      s.setError((err as Error).message ?? '网络异常');
      s.setStreamingCards([]);
      s.setStreamingCardsB([]);
      s.resetAgentTimeline();
      s.setPhase('idle');
    } finally {
      clearInterval(watchdog);
      completedRef.current = true;
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { start, startCompare, abort };
}

/**
 * 调用 /api/compare 流式生成对比摘要并写入 store。
 * 摘要失败不阻断主流程（仅记录警告）。
 */
async function generateCompareSummary(
  queryA: string,
  queryB: string,
  signal: AbortSignal,
): Promise<void> {
  const store = useOmniVisionStore.getState();
  store.setCompareSummaryLoading(true);
  store.setCompareSummary('');

  try {
    const currentState = useOmniVisionStore.getState();
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        queryA,
        cardsA: currentState.cards,
        queryB,
        cardsB: currentState.cardsB,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`对比摘要请求失败：HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseSSEData(rawEvent);
        if (!parsed) continue;

        if (typeof parsed.chunk === 'string') {
          summary += parsed.chunk as string;
          useOmniVisionStore.getState().setCompareSummary(summary);
        }
        if (parsed.done === true) {
          break;
        }
        if (typeof parsed.error === 'string') {
          useOmniVisionStore.getState().setError(parsed.error);
          break;
        }
        if (parsed.error === true && typeof parsed.message === 'string') {
          useOmniVisionStore.getState().setError(parsed.message);
          break;
        }
      }
    }

    // 处理流末尾残留内容
    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsed = parseSSEData(buffer);
      if (parsed && typeof parsed.chunk === 'string') {
        summary += parsed.chunk as string;
        useOmniVisionStore.getState().setCompareSummary(summary);
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    // 摘要失败不阻断主流程
    console.warn('[compare] 摘要生成失败:', (err as Error).message);
  } finally {
    useOmniVisionStore.getState().setCompareSummaryLoading(false);
  }
}

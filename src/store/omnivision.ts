import { create } from 'zustand';
import type {
  CardType,
  CardData,
  ClarifyOption,
  EntityType,
  IntelSource,
  SourceStats,
} from '@/types';

export type Phase = 'idle' | 'clarifying' | 'searching' | 'results' | 'blocked';
export type EngineMode = 'live' | 'mock' | null;
// D3 多视角切换
export type ViewMode = 'all' | 'positive' | 'critical' | 'game';

// 风控拦截 Toast
export interface RiskToastState {
  message: string;
  layer: 'dict' | 'llm' | 'frontend';
  timestamp: number;
}

// 统一拦截结果态元数据（P0：所有拦截入口收敛到 blocked phase）
export interface BlockInfo {
  reason: string;
  layer: 'dict' | 'llm' | 'frontend';
  query: string;
  inCompare: boolean;
  compareSide?: 'A' | 'B';
  timestamp: number;
}

// Agent 进度（ReAct 多轮研究）
export type AgentStage = 'thinking' | 'searching' | 'observing' | 'finalizing';

export interface AgentProgress {
  step: number;
  maxSteps: number;
  thought: string;
  stage?: AgentStage;
  searchQuery?: string;
  searchFocus?: string;
  quality?: 'sufficient' | 'partial' | 'insufficient';
  gaps?: string[];
  newSources?: { title: string; url: string }[];
  newFacts?: { content: string; category: string }[];
  coveredDimensions?: string[];
  sourcesCount?: number;
  factsCount?: number;
  bySource?: Record<string, number>; // PRD-01：多源构成（供研究中 UI 显示）
  timestamp: number;
}

// Agent 研究时间线条目（不可变历史快照，用于思考流展示）
export interface AgentTimelineEntry {
  id: string; // `${step}-${stage}-${timestamp}` 去重键
  timestamp: number;
  step: number;
  maxSteps: number;
  stage: AgentStage;
  thought?: string;
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

export const ALL_CARD_TYPES: CardType[] = [
  'verdict',
  'timeline',
  'achievements',
  'trends',
  'darkside',
  'gameplay',
];

// 可展开的卡片类型（B1）
export const EXPANDABLE_CARDS: CardType[] = ['timeline', 'darkside', 'gameplay'];
// 可追问的卡片类型（B4）
export const ASKABLE_CARDS: CardType[] = ['verdict', 'darkside'];

// 历史记录条目（B2 面包屑）
export interface HistoryEntry {
  query: string;
  entityType: EntityType | null;
  timestamp: number;
}

// 卡片展开内容（B1）
export interface CardExpansion {
  cardType: CardType;
  content: string;
  loading: boolean;
}

// 卡片追问记录（B4）
export interface AskRecord {
  question: string;
  answer: string;
  loading: boolean;
}

interface OmniVisionStore {
  phase: Phase;
  query: string;
  clarifyOptions: ClarifyOption[];
  cards: Partial<Record<CardType, CardData>>;
  streamingCards: CardType[];
  entityType: EntityType | null;
  error: string | null;
  engineMode: EngineMode;
  // C4 数据源溯源
  sources: IntelSource[];
  // 影像档案 — Tavily 返回的图片 URL 列表（独立 SSE 事件推送）
  images: string[];
  // PRD-01 M3：信源构成统计（深度感知展示）
  sourceStats: SourceStats | null;

  // C1 双实体对比模式
  compareMode: boolean;
  compareQueryA: string;
  compareQueryB: string;
  cardsB: Partial<Record<CardType, CardData>>;
  streamingCardsB: CardType[];
  entityTypeB: EntityType | null;
  sourcesB: IntelSource[];
  compareSummary: string;
  compareSummaryLoading: boolean;

  // B2 历史回溯
  history: HistoryEntry[];
  // B5 键盘导航 — 当前聚焦的卡片索引
  focusedCardIndex: number | null;
  // B1 卡片展开状态
  expandedCard: CardType | null;
  expansions: Partial<Record<CardType, CardExpansion>>;
  // B3 时间线聚焦的事件索引
  focusedTimelineIndex: number | null;
  // B4 卡片追问
  asks: Partial<Record<CardType, AskRecord>>;
  // C2 历史档案抽屉开关
  archiveOpen: boolean;
  // D3 多视角切换
  viewMode: ViewMode;
  // 风控拦截 Toast
  riskToast: RiskToastState | null;
  // 统一拦截结果态元数据
  blockInfo: BlockInfo | null;

  // Agent 进度（ReAct 多轮研究）
  agentProgress: AgentProgress | null;
  // Agent 研究时间线（累积所有推送，用于思考流展示）
  agentTimeline: AgentTimelineEntry[];

  setQuery: (q: string) => void;
  setPhase: (p: Phase) => void;
  setClarifyOptions: (opts: ClarifyOption[]) => void;
  setStreamingCards: (types: CardType[]) => void;
  addCard: (type: CardType, data: CardData) => void;
  setEntityType: (e: EntityType) => void;
  setError: (msg: string | null) => void;
  setEngineMode: (mode: EngineMode) => void;
  setSources: (sources: IntelSource[]) => void;
  setImages: (images: string[]) => void;
  setSourceStats: (stats: SourceStats | null) => void;
  clearCards: () => void;
  reset: () => void;
  setArchiveOpen: (open: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setRiskToast: (toast: RiskToastState | null) => void;
  setBlockInfo: (info: BlockInfo | null) => void;
  setAgentProgress: (progress: AgentProgress | null) => void;
  resetAgentTimeline: () => void;

  // C1 对比模式
  setCompareMode: (on: boolean) => void;
  setCompareQuery: (a: string, b: string) => void;
  addCardB: (type: CardType, data: CardData) => void;
  setStreamingCardsB: (types: CardType[]) => void;
  setEntityTypeB: (e: EntityType | null) => void;
  setSourcesB: (sources: IntelSource[]) => void;
  setCompareSummary: (s: string) => void;
  setCompareSummaryLoading: (loading: boolean) => void;
  clearCardsB: () => void;

  // B2 历史
  pushHistory: (query: string, entityType: EntityType | null) => void;
  popHistoryTo: (index: number) => HistoryEntry | null;

  // B5 聚焦
  setFocusedCardIndex: (i: number | null) => void;

  // B1 展开
  setExpandedCard: (type: CardType | null) => void;
  setExpansion: (type: CardType, expansion: Partial<CardExpansion>) => void;

  // B3 时间线聚焦
  setFocusedTimelineIndex: (i: number | null) => void;

  // B4 追问
  setAsk: (type: CardType, ask: Partial<AskRecord>) => void;
}

export const useOmniVisionStore = create<OmniVisionStore>((set) => ({
  phase: 'idle',
  query: '',
  clarifyOptions: [],
  cards: {},
  streamingCards: [],
  entityType: null,
  error: null,
  engineMode: null,
  sources: [],
  images: [],
  sourceStats: null,

  compareMode: false,
  compareQueryA: '',
  compareQueryB: '',
  cardsB: {},
  streamingCardsB: [],
  entityTypeB: null,
  sourcesB: [],
  compareSummary: '',
  compareSummaryLoading: false,

  history: [],
  focusedCardIndex: null,
  expandedCard: null,
  expansions: {},
  focusedTimelineIndex: null,
  asks: {},
  archiveOpen: false,
  viewMode: 'all',
  riskToast: null,
  blockInfo: null,
  agentProgress: null,
  agentTimeline: [],

  setQuery: (q) => set({ query: q }),
  setPhase: (p) => set({ phase: p }),
  setClarifyOptions: (opts) => set({ clarifyOptions: opts }),
  setStreamingCards: (types) => set({ streamingCards: types }),
  addCard: (type, data) =>
    set((state) => ({
      cards: { ...state.cards, [type]: data },
      streamingCards: state.streamingCards.filter((t) => t !== type),
    })),
  setEntityType: (e) => set({ entityType: e }),
  setError: (msg) => set({ error: msg }),
  setEngineMode: (mode) => set({ engineMode: mode }),
  setSources: (sources) => set({ sources }),
  setImages: (images) => set({ images }),
  setSourceStats: (stats) => set({ sourceStats: stats }),
  clearCards: () =>
    set({
      cards: {},
      streamingCards: [],
      expansions: {},
      expandedCard: null,
      asks: {},
      focusedTimelineIndex: null,
      sources: [],
      images: [],
      sourceStats: null,
      compareMode: false,
      compareQueryA: '',
      compareQueryB: '',
      cardsB: {},
      streamingCardsB: [],
      entityTypeB: null,
      sourcesB: [],
      compareSummary: '',
      compareSummaryLoading: false,
      agentProgress: null,
      agentTimeline: [],
      blockInfo: null,
    }),
  reset: () =>
    set({
      phase: 'idle',
      query: '',
      clarifyOptions: [],
      cards: {},
      streamingCards: [],
      entityType: null,
      error: null,
      engineMode: null,
      sources: [],
      images: [],
      sourceStats: null,
      compareMode: false,
      compareQueryA: '',
      compareQueryB: '',
      cardsB: {},
      streamingCardsB: [],
      entityTypeB: null,
      sourcesB: [],
      compareSummary: '',
      compareSummaryLoading: false,
      history: [],
      focusedCardIndex: null,
      expandedCard: null,
      expansions: {},
      focusedTimelineIndex: null,
      asks: {},
      archiveOpen: false,
      viewMode: 'all',
      riskToast: null,
      agentProgress: null,
      agentTimeline: [],
      blockInfo: null,
    }),

  setArchiveOpen: (open) => set({ archiveOpen: open }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setRiskToast: (toast) => set({ riskToast: toast }),
  setBlockInfo: (info) => set({ blockInfo: info }),
  setAgentProgress: (progress) =>
    set((state) => {
      if (progress === null) {
        // 仅清最新态，不清 timeline（由 resetAgentTimeline 显式清）
        return { agentProgress: null };
      }
      // 构造 timeline entry，按 id 去重后追加，上限 30 条 FIFO
      const stage = progress.stage ?? 'thinking';
      const id = `${progress.step}-${stage}-${progress.timestamp}`;
      const entry: AgentTimelineEntry = { ...progress, stage, id };
      const exists = state.agentTimeline.some((e) => e.id === id);
      const nextTimeline = exists
        ? state.agentTimeline
        : [...state.agentTimeline, entry].slice(-30);
      return { agentProgress: progress, agentTimeline: nextTimeline };
    }),
  resetAgentTimeline: () => set({ agentTimeline: [], agentProgress: null }),

  // C1 对比模式
  setCompareMode: (on) => set({ compareMode: on }),
  setCompareQuery: (a, b) => set({ compareQueryA: a, compareQueryB: b }),
  addCardB: (type, data) =>
    set((state) => ({
      cardsB: { ...state.cardsB, [type]: data },
      streamingCardsB: state.streamingCardsB.filter((t) => t !== type),
    })),
  setStreamingCardsB: (types) => set({ streamingCardsB: types }),
  setEntityTypeB: (e) => set({ entityTypeB: e }),
  setSourcesB: (sources) => set({ sourcesB: sources }),
  setCompareSummary: (s) => set({ compareSummary: s }),
  setCompareSummaryLoading: (loading) => set({ compareSummaryLoading: loading }),
  clearCardsB: () =>
    set({
      cardsB: {},
      streamingCardsB: [],
      entityTypeB: null,
      sourcesB: [],
      compareSummary: '',
      compareSummaryLoading: false,
    }),

  // B2 — 历史最多 5 层
  pushHistory: (query, entityType) =>
    set((state) => {
      // 相同查询不重复入栈
      if (state.history.length > 0 && state.history[state.history.length - 1].query === query) {
        return {};
      }
      const next = [...state.history, { query, entityType, timestamp: Date.now() }];
      if (next.length > 5) next.shift();
      return { history: next };
    }),
  popHistoryTo: (index) => {
    let result: HistoryEntry | null = null;
    set((state) => {
      if (index < 0 || index >= state.history.length) return {};
      result = state.history[index];
      return { history: state.history.slice(0, index + 1) };
    });
    return result;
  },

  // B5
  setFocusedCardIndex: (i) => set({ focusedCardIndex: i }),

  // B1
  setExpandedCard: (type) => set({ expandedCard: type }),
  setExpansion: (type, expansion) =>
    set((state) => ({
      expansions: {
        ...state.expansions,
        [type]: { cardType: type, content: '', loading: false, ...state.expansions[type], ...expansion },
      },
    })),

  // B3
  setFocusedTimelineIndex: (i) => set({ focusedTimelineIndex: i }),

  // B4
  setAsk: (type, ask) =>
    set((state) => ({
      asks: {
        ...state.asks,
        [type]: { question: '', answer: '', loading: false, ...state.asks[type], ...ask },
      },
    })),
}));

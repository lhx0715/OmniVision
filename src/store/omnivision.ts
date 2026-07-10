import { create } from 'zustand';
import type {
  CardType,
  CardData,
  ClarifyOption,
  EntityType,
  IntelSource,
} from '@/types';

export type Phase = 'idle' | 'clarifying' | 'searching' | 'results';
export type EngineMode = 'live' | 'mock' | null;
// D3 多视角切换
export type ViewMode = 'all' | 'positive' | 'critical' | 'game';

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

  setQuery: (q: string) => void;
  setPhase: (p: Phase) => void;
  setClarifyOptions: (opts: ClarifyOption[]) => void;
  setStreamingCards: (types: CardType[]) => void;
  addCard: (type: CardType, data: CardData) => void;
  setEntityType: (e: EntityType) => void;
  setError: (msg: string | null) => void;
  setEngineMode: (mode: EngineMode) => void;
  setSources: (sources: IntelSource[]) => void;
  clearCards: () => void;
  reset: () => void;
  setArchiveOpen: (open: boolean) => void;
  setViewMode: (mode: ViewMode) => void;

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
  clearCards: () =>
    set({
      cards: {},
      streamingCards: [],
      expansions: {},
      expandedCard: null,
      asks: {},
      focusedTimelineIndex: null,
      sources: [],
      compareMode: false,
      compareQueryA: '',
      compareQueryB: '',
      cardsB: {},
      streamingCardsB: [],
      entityTypeB: null,
      sourcesB: [],
      compareSummary: '',
      compareSummaryLoading: false,
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
    }),

  setArchiveOpen: (open) => set({ archiveOpen: open }),
  setViewMode: (mode) => set({ viewMode: mode }),

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

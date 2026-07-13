// 共享类型定义 - 前后端通用

export type EntityType = 'HUMAN' | 'EVENT' | 'ITEM';

export type CardType = 'verdict' | 'timeline' | 'achievements' | 'darkside' | 'gameplay' | 'trends';

// 定性卡片
export interface VerdictCardData {
  title: string;
  subtitle: string;
  tags: string[];
}

// 时间线卡片
export interface TimelineCardData {
  events: Array<{
    year: string;
    title: string;
    description: string;
  }>;
}

// 核心成就卡片
export interface AchievementsCardData {
  items: Array<{
    metric: string;
    label: string;
    context?: string;
  }>;
}

// 反向视角卡片
export interface DarksideCardData {
  controversies: Array<{
    title: string;
    detail: string;
    severity: 'high' | 'medium' | 'low';
  }>;
}

// 博弈面卡片
export interface GameplayCardData {
  stakeholders: Array<{
    name: string;
    position: string;
    interest: string;
  }>;
  dynamics: string;
  // D2 新增：stakeholder 间的关系
  relations?: Array<{
    from: string;  // stakeholder name
    to: string;    // stakeholder name
    relation: string;  // 关系类型：竞争/合作/监管/依赖/对立
  }>;
}

// 趋势卡片（D1）
export interface TrendPoint {
  x: string;  // 时间标签，如 "2020"
  y: number;  // 数值
}
export interface TrendSeries {
  label: string;  // 趋势名称，如 "年度交付量"
  points: TrendPoint[];
}
export interface TrendCardData {
  trends: TrendSeries[];
}

export type CardData =
  | VerdictCardData
  | TimelineCardData
  | AchievementsCardData
  | DarksideCardData
  | GameplayCardData
  | TrendCardData;

// SSE 事件
export interface SSECardEvent {
  cardType: CardType;
  payload: CardData;
}

export interface SSEDoneEvent {
  entityType: EntityType;
}

export interface SSEErrorEvent {
  message: string;
}

// 意图确认
export interface ClarifyOption {
  label: string;
  entityType: EntityType;
  description: string;
  searchQuery?: string;
}

export interface ClarifyResponse {
  options: ClarifyOption[];
}

// 搜索请求
export interface SearchRequest {
  query: string;
  entityType?: EntityType;
}

// 情报卡片（引擎产出）
export interface IntelCard {
  cardType: CardType;
  payload: CardData;
}

// 数据源溯源（C4）
export interface IntelSource {
  title: string;
  url: string;
}

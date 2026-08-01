import type { CardType, EntityType, CardData } from '@/types';

/**
 * 知识库卡片元数据与条目类型
 *
 * 独立成模块以避免 src/pages/Library.tsx 与 src/components/LibraryCardDetail.tsx
 * 之间的循环依赖（Library 引用 LibraryCardDetail 组件，LibraryCardDetail 引用卡片元数据）。
 */

/** 知识库条目 — 收藏的情报卡片（与后端 knowledge_items 表对应） */
export interface KnowledgeItem {
  id: string;
  sourceQuery: string;
  entityName: string;
  entityType: EntityType | null;
  cardType: CardType;
  cardPayload: CardData;
  savedAt: string;
}

/** 卡片类型元数据 — 标签、配色、编号字母 */
export const CARD_META: Record<CardType, { label: string; color: string; icon: string }> = {
  verdict: { label: '定性评估', color: 'emerald', icon: 'V' },
  timeline: { label: '时间线', color: 'cyan', icon: 'T' },
  achievements: { label: '核心战绩', color: 'amber', icon: 'A' },
  trends: { label: '趋势数据', color: 'sky', icon: 'D' },
  darkside: { label: '暗面档案', color: 'rose', icon: 'X' },
  gameplay: { label: '关系网络', color: 'violet', icon: 'N' },
};

/** 实体类型中文标签 */
export const ENTITY_LABELS: Record<string, string> = {
  HUMAN: '人物',
  EVENT: '事件',
  ITEM: '事物',
};

/** 文件夹图谱元信息（已生成时非空） */
export interface FolderGraphMeta {
  id: string;
  nodeCount: number;
  edgeCount: number;
  version: number;
  generatedAt: string;
}

/** 知识库文件夹摘要 — 与后端 GET /api/folders 返回结构对齐 */
export interface FolderSummary {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  graph: FolderGraphMeta | null;
}

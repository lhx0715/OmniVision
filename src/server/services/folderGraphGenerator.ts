import { prisma, uuid } from '../db.js'
import { extractCardGraphToMemory } from './graphExtractor.js'
import type { EntityType, CardType, CardData } from '@shared/types.js'

/**
 * 文件夹级知识图谱 — 节点 / 边 / 快照结构
 *
 * 与全局 Entity/Relation 表解耦：folder 图谱是"基于该文件夹内全部卡片抽取后聚合的快照"，
 * 存储在 knowledge_graphs 表的 JSON 字段中，可独立重生（覆盖式 upsert）。
 */

export interface FolderGraphNode {
  id: string
  label: string
  entityType: string | null
  sourceQuery: string | null
  degree: number
  isRoot: boolean
  cardIds: string[]
}

export interface FolderGraphEdge {
  id: string
  source: string
  target: string
  label: string
  sourceCardType: string | null
  sourceQuery: string | null
  cardIds: string[]
}

export interface FolderGraphSnapshot {
  id: string
  folderId: string
  nodes: FolderGraphNode[]
  edges: FolderGraphEdge[]
  nodeCount: number
  edgeCount: number
  sourceCardIds: string[]
  version: number
  generatedAt: string
}

interface CardContext {
  sourceQuery: string
  entityName: string
  entityType: EntityType | null
  cardType: CardType
  cardPayload: CardData
}

/**
 * 拉取文件夹内全部卡片 → 逐张抽取实体/关系 → 内存合并去重 → upsert 到 knowledge_graphs 表
 *
 * @returns 生成的快照；folder 不存在或不属于该用户时返回 null
 */
export async function generateFolderGraph(
  userId: string,
  folderId: string,
): Promise<FolderGraphSnapshot | null> {
  const folder = await prisma.knowledgeFolder.findUnique({ where: { id: folderId } })
  if (!folder || folder.userId !== userId) return null

  const items = await prisma.knowledgeItem.findMany({
    where: { userId, folderId },
    orderBy: { savedAt: 'asc' },
  })

  // 内存聚合
  const nodeMap = new Map<string, FolderGraphNode>() // key = label
  const edgeMap = new Map<string, FolderGraphEdge>() // key = `${from}::${to}::${relation}`
  const sourceCardIds: string[] = []

  const ensureNode = (label: string, entityType: string | null, sourceQuery: string | null, cardId: string, isRoot: boolean): FolderGraphNode => {
    const trimmed = label.trim()
    const existing = nodeMap.get(trimmed)
    if (existing) {
      if (cardId && !existing.cardIds.includes(cardId)) existing.cardIds.push(cardId)
      if (isRoot) existing.isRoot = true
      if (entityType && !existing.entityType) existing.entityType = entityType
      return existing
    }
    const node: FolderGraphNode = {
      id: uuid(),
      label: trimmed,
      entityType,
      sourceQuery,
      degree: 0,
      isRoot,
      cardIds: cardId ? [cardId] : [],
    }
    nodeMap.set(trimmed, node)
    return node
  }

  for (const item of items) {
    sourceCardIds.push(item.id)
    const card: CardContext = {
      sourceQuery: item.sourceQuery,
      entityName: item.entityName,
      entityType: (item.entityType as EntityType | null) ?? null,
      cardType: item.cardType as CardType,
      cardPayload: JSON.parse(item.cardPayload) as CardData,
    }

    const { nodes: memNodes, edges: memEdges } = await extractCardGraphToMemory(card)

    // 主实体强制入图并标记为 root
    const mainLabel = item.entityName.trim()
    ensureNode(mainLabel, card.entityType ?? 'ITEM', item.sourceQuery, item.id, true)

    for (const n of memNodes) {
      if (n.label === mainLabel) {
        // 已通过 ensureNode 处理，补 cardId
        ensureNode(n.label, n.entityType, n.sourceQuery, item.id, n.isMain)
        continue
      }
      ensureNode(n.label, n.entityType, n.sourceQuery, item.id, false)
    }

    for (const e of memEdges) {
      const fromNode = nodeMap.get(e.from.trim())
      const toNode = nodeMap.get(e.to.trim())
      if (!fromNode || !toNode) continue

      const key = `${fromNode.label}::${toNode.label}::${e.relation}`
      const existing = edgeMap.get(key)
      if (existing) {
        if (!existing.cardIds.includes(item.id)) existing.cardIds.push(item.id)
      } else {
        edgeMap.set(key, {
          id: uuid(),
          source: fromNode.id,
          target: toNode.id,
          label: e.relation,
          sourceCardType: e.sourceCardType,
          sourceQuery: e.sourceQuery,
          cardIds: [item.id],
        })
      }
    }
  }

  // 计算度数
  const nodes = Array.from(nodeMap.values())
  const edges = Array.from(edgeMap.values())
  for (const e of edges) {
    const s = nodes.find((n) => n.id === e.source)
    const t = nodes.find((n) => n.id === e.target)
    if (s) s.degree++
    if (t) t.degree++
  }

  // upsert 快照（version 递增）
  const existing = await prisma.knowledgeGraph.findUnique({ where: { folderId } })
  const version = (existing?.version ?? 0) + 1
  const graph = await prisma.knowledgeGraph.upsert({
    where: { folderId },
    create: {
      id: uuid(),
      userId,
      folderId,
      nodesJson: JSON.stringify(nodes),
      edgesJson: JSON.stringify(edges),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceCardIds: JSON.stringify(sourceCardIds),
      version,
    },
    update: {
      nodesJson: JSON.stringify(nodes),
      edgesJson: JSON.stringify(edges),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceCardIds: JSON.stringify(sourceCardIds),
      version,
      generatedAt: new Date(),
    },
  })

  console.log(
    `[folderGraph] 文件夹 ${folder.name} 图谱生成: ${nodes.length} 节点 / ${edges.length} 关系 (v${version})`,
  )

  return {
    id: graph.id,
    folderId,
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    sourceCardIds,
    version,
    generatedAt: graph.generatedAt.toISOString(),
  }
}

/**
 * 读取文件夹图谱快照
 */
export async function getFolderGraph(
  userId: string,
  folderId: string,
): Promise<FolderGraphSnapshot | null> {
  const graph = await prisma.knowledgeGraph.findUnique({ where: { folderId } })
  if (!graph || graph.userId !== userId) return null
  return {
    id: graph.id,
    folderId,
    nodes: JSON.parse(graph.nodesJson),
    edges: JSON.parse(graph.edgesJson),
    nodeCount: graph.nodeCount,
    edgeCount: graph.edgeCount,
    sourceCardIds: JSON.parse(graph.sourceCardIds),
    version: graph.version,
    generatedAt: graph.generatedAt.toISOString(),
  }
}

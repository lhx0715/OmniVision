/**
 * 关系发现服务（PRD-02 FR-07）
 *
 * 探索图谱的核心：针对选中节点追问 → 多源检索 → LLM 三元组抽取 → 并入会话图。
 *
 * 流程：
 *   1. 取 targetNode 上下文（label/type/已有邻居）+ question
 *   2. 多源检索（复用 PRD-01 适配器+融合，聚焦"关系发现"）
 *   3. LLM 关系抽取（锚定 targetNode，发现新实体）
 *   4. 并入会话图（getOrCreateNode/Edge + writeStep）
 *
 * 复用：sources/registry、fusion、llmClient
 */
import type { EntityType } from '../../shared/types.js'
import { getActiveAdapters, searchAll } from './sources/registry.js'
import type { RecallResult, RawDoc } from './sources/types.js'
import { callLLM, extractJSON } from './llmClient.js'
import { getOrCreateNode, getOrCreateEdge, writeStep } from './exploreGraph.js'

// ===== 配置 =====

const MAX_RESULTS_PER_SEARCH = 6
const MAX_DOCS_FOR_EXTRACTION = 15 // 控制送 LLM 的文档数
const MAX_DOC_CONTENT_LEN = 600

// ===== 类型 =====

export interface DiscoveredRelation {
  from: string
  to: string
  relation: string
  fromType: string | null
  toType: string | null
}

export interface DiscoveryResult {
  addedNodes: { id: string; label: string; entityType: string | null; isNew: boolean }[]
  addedEdges: { id: string; from: string; to: string; relation: string; isNew: boolean }[]
  answerSummary: string
  sources: { title: string; url: string }[]
  stepIndex: number
}

// ===== LLM 关系抽取 Prompt（锚定 targetNode）=====

const RELATION_DISCOVERY_PROMPT = `你是知识图谱关系发现器。基于搜索结果，针对目标实体「{TARGET}」发现其与相关实体的关系。

## 任务
1. 从搜索结果中提取与「{TARGET}」直接相关的实体（人/组织/事件/产品/技术等）
2. 提取它们之间的关系三元组
3. 用一句话凝练本轮发现的核心结论（answer_summary）

## 关系类型（按实体组合）
- 人-人：家庭 / 婚姻 / 师徒 / 合作 / 竞争 / 对立 / 投资 / 监管
- 人-事：创立 / 参与 / 引发 / 主导 / 影响
- 事-事：导致 / 衍生 / 关联
- 人/事-物：发明 / 持有 / 代表作 / 竞品

## 规则
- from 或 to 中至少一个必须是「{TARGET}」或其已知变体（锚定目标）
- 仅提取搜索结果有证据支撑的关系，不臆造
- 新实体名要具体（如"黄仁勋"而非"CEO"），便于图谱去重
- fromType / toType ∈ HUMAN / EVENT / ITEM

## 输出 JSON
{
  "relations": [
    { "from": "{TARGET}", "to": "实体名", "relation": "关系", "fromType": "ITEM", "toType": "HUMAN" }
  ],
  "answer_summary": "一句话凝练本轮发现",
  "new_entities": ["新发现的实体名1", "实体名2"]
}`

/**
 * LLM 关系抽取（锚定 targetNode）
 */
async function extractRelations(
  targetLabel: string,
  question: string,
  searchContext: string,
  neighborLabels: string[],
): Promise<{ relations: DiscoveredRelation[]; answerSummary: string }> {
  const neighborInfo = neighborLabels.length > 0 ? `\n## 已知邻居（避免重复发现）\n${neighborLabels.join(', ')}` : ''

  const systemPrompt = RELATION_DISCOVERY_PROMPT.replace(/\{TARGET\}/g, targetLabel)
  const userPrompt = `追问: ${question}${neighborInfo}\n\n## 搜索结果\n${searchContext}`

  try {
    const content = await callLLM(systemPrompt, userPrompt, {
      temperature: 0.2,
      maxTokens: 1500,
      jsonMode: true,
    })

    const parsed = extractJSON(content) as {
      relations?: Array<{ from?: string; to?: string; relation?: string; fromType?: string; toType?: string }>
      answer_summary?: string
    }

    const relations: DiscoveredRelation[] = (Array.isArray(parsed.relations) ? parsed.relations : [])
      .filter(
        (r) =>
          r &&
          typeof r.from === 'string' &&
          typeof r.to === 'string' &&
          typeof r.relation === 'string',
      )
      .filter((r) => r.from!.trim() && r.to!.trim() && r.relation!.trim())
      .map((r) => ({
        from: r.from!.trim(),
        to: r.to!.trim(),
        relation: r.relation!.trim(),
        fromType: normalizeType(r.fromType),
        toType: normalizeType(r.toType),
      }))

    const answerSummary =
      typeof parsed.answer_summary === 'string' && parsed.answer_summary.trim()
        ? parsed.answer_summary.trim()
        : relations.length > 0
          ? `发现 ${relations.length} 条关系`
          : '未发现明确关系'

    return { relations, answerSummary }
  } catch (err) {
    console.warn('[relationDiscovery] LLM 抽取失败:', (err as Error).message)
    return { relations: [], answerSummary: '关系抽取失败，请重试' }
  }
}

function normalizeType(t?: string): string | null {
  if (!t) return null
  const u = t.toUpperCase()
  if (u === 'HUMAN' || u === 'EVENT' || u === 'ITEM') return u
  if (t.includes('人')) return 'HUMAN'
  if (t.includes('事') || t.includes('事件')) return 'EVENT'
  if (t.includes('物') || t.includes('产品') || t.includes('公司')) return 'ITEM'
  return null
}

/**
 * 多源检索（复用 PRD-01 适配器）
 */
async function multiSourceSearch(
  query: string,
  entityType: EntityType,
): Promise<RecallResult> {
  const adapters = getActiveAdapters(entityType)
  try {
    const recall = await searchAll(
      query,
      { entityType, maxResults: MAX_RESULTS_PER_SEARCH },
      adapters,
    )
    return recall
  } catch (err) {
    console.warn('[relationDiscovery] 多源检索失败:', (err as Error).message)
    return { docs: [], bySource: {}, images: [], perSource: [] }
  }
}

/**
 * 构建搜索查询：targetLabel + question
 */
function buildSearchQuery(targetLabel: string, question: string): string {
  // 简单拼接：目标实体 + 追问关键词
  // 如果 question 已包含 targetLabel，直接用 question
  if (question.includes(targetLabel)) return question
  return `${targetLabel} ${question}`
}

// ===== 主入口：发现关系并并入会话图 =====

/**
 * 对 targetNode 追问 → 多源检索 → LLM 抽取 → 并入会话图 → 写 step
 *
 * @param userId 用户 ID
 * @param sessionId 会话 ID
 * @param targetNodeId 被追问的节点 ID
 * @param targetLabel 被追问的节点名称
 * @param targetEntityType 被追问节点的实体类型
 * @param question 用户追问
 * @param stepIndex 当前步数（从 1 开始，0 是种子）
 * @param neighborLabels 已有邻居标签（避免重复发现）
 * @param onProgress SSE 进度回调
 */
export async function discoverAndMerge(
  userId: string,
  sessionId: string,
  targetNodeId: string,
  targetLabel: string,
  targetEntityType: EntityType,
  question: string,
  stepIndex: number,
  neighborLabels: string[],
  onProgress?: (stage: string, data?: unknown) => void,
): Promise<DiscoveryResult> {
  // ① planning
  onProgress?.('planning')
  const searchQuery = buildSearchQuery(targetLabel, question)
  console.log(`[relationDiscovery] Step ${stepIndex}: target="${targetLabel}", query="${searchQuery}"`)

  // ② searching（多源并行）
  onProgress?.('searching', { searchQuery })
  const recall = await multiSourceSearch(searchQuery, targetEntityType)

  if (recall.docs.length === 0) {
    console.warn('[relationDiscovery] 搜索无结果')
    const step = writeStep(userId, sessionId, {
      stepIndex,
      targetNodeId,
      targetLabel,
      question,
      answerSummary: '搜索无结果，换个角度追问试试',
      addedNodeIds: [],
      addedEdgeIds: [],
      sources: [],
    })
    return {
      addedNodes: [],
      addedEdges: [],
      answerSummary: '搜索无结果，换个角度追问试试',
      sources: [],
      stepIndex,
    }
  }

  // ③ extracting（LLM 三元组抽取）
  onProgress?.('extracting')
  const docsForContext = recall.docs.slice(0, MAX_DOCS_FOR_EXTRACTION)
  const searchContext = docsForContext
    .map((d) => {
      const content = d.content.length > MAX_DOC_CONTENT_LEN
        ? d.content.slice(0, MAX_DOC_CONTENT_LEN) + '…'
        : d.content
      return `[${d.title}]\n${content}`
    })
    .join('\n\n---\n\n')

  const { relations, answerSummary } = await extractRelations(
    targetLabel,
    question,
    searchContext,
    neighborLabels,
  )

  // ④ merging（并入会话图）
  onProgress?.('merging')
  const addedNodes: DiscoveryResult['addedNodes'] = []
  const addedEdges: DiscoveryResult['addedEdges'] = []
  const addedNodeIds: string[] = []
  const addedEdgeIds: string[] = []

  for (const rel of relations) {
    // getOrCreate from 节点
    const fromResult = getOrCreateNode(userId, sessionId, rel.from, rel.fromType, stepIndex)
    if (fromResult.isNew) {
      addedNodes.push({ id: fromResult.id, label: rel.from, entityType: rel.fromType, isNew: true })
      addedNodeIds.push(fromResult.id)
      onProgress?.('newNode', { id: fromResult.id, label: rel.from, entityType: rel.fromType })
    }

    // getOrCreate to 节点
    const toResult = getOrCreateNode(userId, sessionId, rel.to, rel.toType, stepIndex)
    if (toResult.isNew) {
      addedNodes.push({ id: toResult.id, label: rel.to, entityType: rel.toType, isNew: true })
      addedNodeIds.push(toResult.id)
      onProgress?.('newNode', { id: toResult.id, label: rel.to, entityType: rel.toType })
    }

    // getOrCreate 边
    const edgeResult = getOrCreateEdge(
      userId,
      sessionId,
      fromResult.id,
      toResult.id,
      rel.relation,
      stepIndex,
    )
    if (edgeResult.isNew) {
      addedEdges.push({
        id: edgeResult.id,
        from: rel.from,
        to: rel.to,
        relation: rel.relation,
        isNew: true,
      })
      addedEdgeIds.push(edgeResult.id)
      onProgress?.('newEdge', {
        id: edgeResult.id,
        fromId: fromResult.id,
        toId: toResult.id,
        from: rel.from,
        to: rel.to,
        relation: rel.relation,
      })
    }
  }

  // 提取来源（前 8 条）
  const sources = recall.docs.slice(0, 8).map((d: RawDoc) => ({ title: d.title, url: d.url }))

  // ⑤ 写 step 记录
  writeStep(userId, sessionId, {
    stepIndex,
    targetNodeId,
    targetLabel,
    question,
    answerSummary,
    addedNodeIds,
    addedEdgeIds,
    sources,
  })

  console.log(
    `[relationDiscovery] Step ${stepIndex} 完成: +${addedNodes.length} 节点, +${addedEdges.length} 边`,
  )

  return {
    addedNodes,
    addedEdges,
    answerSummary,
    sources,
    stepIndex,
  }
}

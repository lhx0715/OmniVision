/**
 * 知识图谱抽取器
 *
 * 从收藏的卡片 payload 中自动提取实体节点与关系边
 *
 * 抽取来源：
 *   - verdict     → 主实体节点 + 标签属性
 *   - timeline    → 时序事件边（主实体 -[年份事件]-> 衍生实体）
 *   - gameplay    → 核心关系网（stakeholders + relations 三元组）
 *   - darkside    → 负向关系边
 *
 * 实体消歧策略：
 *   1. 精确名称匹配（同名直接合并）
 *   2. 别名表（KNOWN_HUMANS 等）
 *   3. 后期可扩展 LLM 语义判断
 */
import { getDb, uuid } from '../db.js'
import type { EntityType, CardType, CardData, GameplayCardData, DarksideCardData, TimelineCardData, VerdictCardData } from '../../shared/types.js'

interface CardContext {
  sourceQuery: string
  entityName: string
  entityType: EntityType | null
  cardType: CardType
  cardPayload: CardData
}

// ===== LLM 语义关系抽取（从卡片全文提取人-人/人-事/事-事等语义关系）=====
//
// 覆盖 verdict / timeline / darkside / achievements / trends 卡片
// （gameplay 已有结构化 relations 三元组，跳过避免重复）
// LLM 不可用或调用失败 → 返回空数组，降级保留现有规则抽取，图谱仍可用

function cfg() {
  return {
    LLM_API_KEY: process.env.LLM_API_KEY ?? '',
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    LLM_MODEL: process.env.LLM_MODEL ?? 'gpt-4o',
    LLM_ROUTER_MODEL: process.env.LLM_ROUTER_MODEL ?? '',
  }
}

function hasLLM(): boolean {
  return Boolean(process.env.LLM_API_KEY)
}

interface RawRelation {
  from: string
  to: string
  relation: string
  fromType: string | null
  toType: string | null
}

/** 将 LLM 输出的类型字段归一化为 HUMAN/EVENT/ITEM，无法识别返回 null */
function normalizeType(t?: string): string | null {
  if (!t) return null
  const u = t.toUpperCase()
  if (u === 'HUMAN' || u === 'EVENT' || u === 'ITEM') return u
  if (t.includes('人')) return 'HUMAN'
  if (t.includes('事') || t.includes('事件')) return 'EVENT'
  if (t.includes('物') || t.includes('东西') || t.includes('产品')) return 'ITEM'
  return null
}

const RELATION_EXTRACT_PROMPT = `你是知识图谱关系抽取器。从情报卡片中提取实体间的语义关系三元组。

## 关系类型（按实体组合）
- 人-人：家庭 / 婚姻 / 师徒 / 合作 / 竞争 / 对立 / 利益绑定 / 投资 / 监管
- 人-事：创立 / 参与 / 引发 / 主导 / 影响 / 投身
- 事-事：导致 / 衍生 / 关联 / 背景因果
- 人/事-物：发明 / 持有 / 代表作

## 规则
- 仅提取卡片内容明确体现的关系，不臆造、不补全常识
- from / to 必须是卡片中出现的实体名（通常包含主实体）
- fromType / toType ∈ HUMAN / EVENT / ITEM

## 输出
严格输出 JSON，不输出任何其他文字：
{"relations":[{"from":"实体名","to":"实体名","relation":"关系","fromType":"HUMAN","toType":"EVENT"}]}
无关系时返回 {"relations":[]}`

/** 将卡片内容拼装为 LLM 可读的抽取输入 */
function buildRelationPrompt(card: CardContext): string {
  const { entityName, entityType, cardType, cardPayload } = card
  const payloadStr = JSON.stringify(cardPayload, null, 2)
  return `主实体：${entityName}（类型：${entityType ?? '未知'}）
卡片类型：${cardType}
卡片内容：
${payloadStr}`
}

/**
 * 调用 LLM 从卡片中抽取语义关系三元组
 *
 * @returns RawRelation[] — LLM 不可用或失败时返回空数组（降级）
 */
async function extractRelationsViaLLM(card: CardContext): Promise<RawRelation[]> {
  if (card.cardType === 'gameplay') return []
  if (!hasLLM()) return []

  const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_ROUTER_MODEL } = cfg()

  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_ROUTER_MODEL || LLM_MODEL,
        messages: [
          { role: 'system', content: RELATION_EXTRACT_PROMPT },
          { role: 'user', content: buildRelationPrompt(card) },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      console.warn(`[graphExtractor] LLM 关系抽取失败: HTTP ${res.status}，降级`)
      return []
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''

    let parsed: { relations?: RawRelation[] }
    try {
      parsed = JSON.parse(content)
    } catch {
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) {
        console.warn('[graphExtractor] LLM 关系抽取返回非 JSON，降级')
        return []
      }
      parsed = JSON.parse(match[0])
    }

    const relations = Array.isArray(parsed.relations) ? parsed.relations : []
    return relations
      .filter(
        (r) =>
          r &&
          typeof r.from === 'string' &&
          typeof r.to === 'string' &&
          typeof r.relation === 'string',
      )
      .filter((r) => r.from.trim() && r.to.trim() && r.relation.trim())
      .map((r) => ({
        from: r.from.trim(),
        to: r.to.trim(),
        relation: r.relation.trim(),
        fromType: normalizeType(r.fromType),
        toType: normalizeType(r.toType),
      }))
  } catch (err) {
    console.warn('[graphExtractor] LLM 关系抽取异常，降级:', (err as Error).message)
    return []
  }
}

/**
 * 获取或创建实体节点
 * 同名实体自动合并（UNIQUE 约束）
 */
function getOrCreateEntity(userId: string, name: string, entityType: string | null, sourceQuery: string): string {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM entities WHERE user_id = ? AND name = ?').get(userId, name) as { id: string } | undefined

  if (existing) return existing.id

  const id = uuid()
  db.prepare(
    'INSERT INTO entities (id, user_id, name, entity_type, source_query) VALUES (?, ?, ?, ?, ?)',
  ).run(id, userId, name, entityType, sourceQuery)

  return id
}

/**
 * 获取或创建关系边
 * 相同 from-to-type 三元组自动合并（UNIQUE 约束）
 */
function getOrCreateRelation(
  userId: string,
  fromEntityId: string,
  toEntityId: string,
  relationType: string,
  sourceCardType: string,
  sourceQuery: string,
): void {
  const db = getDb()
  const existing = db
    .prepare('SELECT id FROM relations WHERE user_id = ? AND from_entity_id = ? AND to_entity_id = ? AND relation_type = ?')
    .get(userId, fromEntityId, toEntityId, relationType)

  if (existing) return

  const id = uuid()
  db.prepare(
    `INSERT INTO relations (id, user_id, from_entity_id, to_entity_id, relation_type, source_card_type, source_query)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, fromEntityId, toEntityId, relationType, sourceCardType, sourceQuery)
}

/**
 * 从卡片中抽取图谱数据
 *
 * @param userId 用户 ID
 * @param card 卡片上下文
 */
export async function extractGraphFromCard(userId: string, card: CardContext): Promise<void> {
  const { sourceQuery, entityName, entityType, cardType, cardPayload } = card

  // 主实体节点始终创建
  const mainEntityId = getOrCreateEntity(userId, entityName, entityType ?? 'ITEM', sourceQuery)

  switch (cardType) {
    case 'verdict': {
      // verdict 只确认主实体存在，标签不单独建边
      break
    }

    case 'timeline': {
      // timeline: 提取事件中的其他实体名，建立时序边
      const payload = cardPayload as TimelineCardData
      if (!payload.events) break

      for (const event of payload.events) {
        // 从事件标题中提取可能的实体名（简单启发式：标题本身可能包含实体）
        // 这里保守处理：只将事件标题作为衍生节点
        const eventTitle = event.title?.trim()
        if (eventTitle && eventTitle !== entityName) {
          const eventId = getOrCreateEntity(userId, eventTitle, 'EVENT', sourceQuery)
          getOrCreateRelation(userId, mainEntityId, eventId, `时序·${event.year || '未知'}`, 'timeline', sourceQuery)
        }
      }
      break
    }

    case 'gameplay': {
      // gameplay: 核心关系网 — stakeholders 是节点，relations 是边
      const payload = cardPayload as GameplayCardData
      if (!payload.stakeholders) break

      // 为每个 stakeholder 创建实体节点
      const stakeholderMap = new Map<string, string>()
      for (const s of payload.stakeholders) {
        const name = s.name?.trim()
        if (!name) continue
        // stakeholder 名称可能就是主实体
        if (name === entityName) {
          stakeholderMap.set(name, mainEntityId)
          continue
        }
        const eid = getOrCreateEntity(userId, name, null, sourceQuery)
        stakeholderMap.set(name, eid)
      }

      // 建立 relations 三元组
      if (payload.relations) {
        for (const rel of payload.relations) {
          const fromName = rel.from?.trim()
          const toName = rel.to?.trim()
          const relType = rel.relation?.trim()
          if (!fromName || !toName || !relType) continue

          const fromId = stakeholderMap.get(fromName) ?? getOrCreateEntity(userId, fromName, null, sourceQuery)
          const toId = stakeholderMap.get(toName) ?? getOrCreateEntity(userId, toName, null, sourceQuery)

          getOrCreateRelation(userId, fromId, toId, relType, 'gameplay', sourceQuery)
        }
      }

      // 同时建立主实体与每个 stakeholder 的关联边（如果 relations 中没有覆盖）
      for (const [name, eid] of stakeholderMap) {
        if (eid === mainEntityId) continue
        // 检查是否已有边
        const hasEdge = getDb()
          .prepare('SELECT 1 FROM relations WHERE user_id = ? AND from_entity_id = ? AND to_entity_id = ?')
          .get(userId, mainEntityId, eid)
        if (!hasEdge) {
          // 从 position 推断关系类型
          getOrCreateRelation(userId, mainEntityId, eid, '关联', 'gameplay', sourceQuery)
        }
      }
      break
    }

    case 'darkside': {
      // darkside: 提取争议中的相关方，建立负向关系边
      const payload = cardPayload as DarksideCardData
      if (!payload.controversies) break

      for (const c of payload.controversies) {
        const title = c.title?.trim()
        if (!title) continue
        // 争议标题作为事件节点
        const eventId = getOrCreateEntity(userId, title, 'EVENT', sourceQuery)
        getOrCreateRelation(userId, mainEntityId, eventId, '争议', 'darkside', sourceQuery)
      }
      break
    }

    case 'achievements':
    case 'trends':
      // 成就和趋势不直接构图，只确认主实体
      break
  }

  // LLM 语义关系抽取：从卡片全文提取人-人/人-事/事-事等语义关系
  // 覆盖 verdict / timeline / darkside / achievements / trends（gameplay 已有结构化 relations，内部跳过）
  // 抽取出的关系 sourceCardType 统一记 'llm'，与 gameplay/darkside/timeline 区分，前端独立着色
  const llmRelations = await extractRelationsViaLLM(card)
  for (const r of llmRelations) {
    const fromId = getOrCreateEntity(userId, r.from, r.fromType, sourceQuery)
    const toId = getOrCreateEntity(userId, r.to, r.toType, sourceQuery)
    getOrCreateRelation(userId, fromId, toId, r.relation, 'llm', sourceQuery)
  }
  if (llmRelations.length > 0) {
    console.log(`[graphExtractor] LLM 语义抽取: ${llmRelations.length} 条关系`)
  }

  console.log(`[graphExtractor] 图谱更新: entity=${entityName}, cardType=${cardType}`)
}

/**
 * 实体名称标准化（简单的别名消歧）
 * 后期可扩展为 LLM 语义判断
 */
function normalizeEntityName(name: string): string {
  return name.trim()
}

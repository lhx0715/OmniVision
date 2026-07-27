import { prisma, uuid } from '../db.js'
import type { EntityType, CardType, CardData, GameplayCardData, DarksideCardData, TimelineCardData, VerdictCardData } from '@shared/types.js'

interface CardContext {
  sourceQuery: string
  entityName: string
  entityType: EntityType | null
  cardType: CardType
  cardPayload: CardData
}

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

function buildRelationPrompt(card: CardContext): string {
  const { entityName, entityType, cardType, cardPayload } = card
  const payloadStr = JSON.stringify(cardPayload, null, 2)
  return `主实体：${entityName}（类型：${entityType ?? '未知'}）
卡片类型：${cardType}
卡片内容：
${payloadStr}`
}

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

async function getOrCreateEntity(userId: string, name: string, entityType: string | null, sourceQuery: string): Promise<string> {
  const existing = await prisma.entity.findUnique({
    where: { userId_name: { userId, name } },
  })

  if (existing) return existing.id

  const id = uuid()
  await prisma.entity.create({
    data: {
      id,
      userId,
      name,
      entityType,
      sourceQuery,
    },
  })

  return id
}

async function getOrCreateRelation(
  userId: string,
  fromEntityId: string,
  toEntityId: string,
  relationType: string,
  sourceCardType: string,
  sourceQuery: string,
): Promise<void> {
  const existing = await prisma.relation.findUnique({
    where: { userId_fromEntityId_toEntityId_relationType: { userId, fromEntityId, toEntityId, relationType } },
  })

  if (existing) return

  const id = uuid()
  await prisma.relation.create({
    data: {
      id,
      userId,
      fromEntityId,
      toEntityId,
      relationType,
      sourceCardType,
      sourceQuery,
    },
  })
}

export async function extractGraphFromCard(userId: string, card: CardContext): Promise<void> {
  const { sourceQuery, entityName, entityType, cardType, cardPayload } = card

  const mainEntityId = await getOrCreateEntity(userId, entityName, entityType ?? 'ITEM', sourceQuery)

  switch (cardType) {
    case 'verdict': {
      break
    }

    case 'timeline': {
      const payload = cardPayload as TimelineCardData
      if (!payload.events) break

      for (const event of payload.events) {
        const eventTitle = event.title?.trim()
        if (eventTitle && eventTitle !== entityName) {
          const eventId = await getOrCreateEntity(userId, eventTitle, 'EVENT', sourceQuery)
          await getOrCreateRelation(userId, mainEntityId, eventId, `时序·${event.year || '未知'}`, 'timeline', sourceQuery)
        }
      }
      break
    }

    case 'gameplay': {
      const payload = cardPayload as GameplayCardData
      if (!payload.stakeholders) break

      const stakeholderMap = new Map<string, string>()
      for (const s of payload.stakeholders) {
        const name = s.name?.trim()
        if (!name) continue
        if (name === entityName) {
          stakeholderMap.set(name, mainEntityId)
          continue
        }
        const eid = await getOrCreateEntity(userId, name, null, sourceQuery)
        stakeholderMap.set(name, eid)
      }

      if (payload.relations) {
        for (const rel of payload.relations) {
          const fromName = rel.from?.trim()
          const toName = rel.to?.trim()
          const relType = rel.relation?.trim()
          if (!fromName || !toName || !relType) continue

          const fromId = stakeholderMap.get(fromName) ?? (await getOrCreateEntity(userId, fromName, null, sourceQuery))
          const toId = stakeholderMap.get(toName) ?? (await getOrCreateEntity(userId, toName, null, sourceQuery))

          await getOrCreateRelation(userId, fromId, toId, relType, 'gameplay', sourceQuery)
        }
      }

      for (const [name, eid] of stakeholderMap) {
        if (eid === mainEntityId) continue
        const hasEdge = await prisma.relation.findUnique({
          where: { userId_fromEntityId_toEntityId_relationType: { userId, fromEntityId: mainEntityId, toEntityId: eid, relationType: '关联' } },
        })
        if (!hasEdge) {
          await getOrCreateRelation(userId, mainEntityId, eid, '关联', 'gameplay', sourceQuery)
        }
      }
      break
    }

    case 'darkside': {
      const payload = cardPayload as DarksideCardData
      if (!payload.controversies) break

      for (const c of payload.controversies) {
        const title = c.title?.trim()
        if (!title) continue
        const eventId = await getOrCreateEntity(userId, title, 'EVENT', sourceQuery)
        await getOrCreateRelation(userId, mainEntityId, eventId, '争议', 'darkside', sourceQuery)
      }
      break
    }

    case 'achievements':
    case 'trends':
      break
  }

  const llmRelations = await extractRelationsViaLLM(card)
  for (const r of llmRelations) {
    const fromId = await getOrCreateEntity(userId, r.from, r.fromType, sourceQuery)
    const toId = await getOrCreateEntity(userId, r.to, r.toType, sourceQuery)
    await getOrCreateRelation(userId, fromId, toId, r.relation, 'llm', sourceQuery)
  }
  if (llmRelations.length > 0) {
    console.log(`[graphExtractor] LLM 语义抽取: ${llmRelations.length} 条关系`)
  }

  console.log(`[graphExtractor] 图谱更新: entity=${entityName}, cardType=${cardType}`)
}

function normalizeEntityName(name: string): string {
  return name.trim()
}

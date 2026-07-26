/**
 * 知识库 CRUD 路由
 *
 * POST   /api/library          — 收藏卡片到知识库
 * GET    /api/library          — 获取知识库列表（支持筛选）
 * GET    /api/library/:id      — 获取单条知识库条目
 * DELETE /api/library/:id      — 从知识库移除
 * GET    /api/library/stats    — 知识库统计
 */
import { Router, type Request, type Response } from 'express'
import { getDb, uuid } from '../db.js'
import { extractUserId } from '../services/authService.js'
import { extractGraphFromCard } from '../services/graphExtractor.js'
import type { EntityType, CardType, CardData } from '../../shared/types.js'

const router = Router()

/** 认证中间件 — 所有知识库操作都需要登录 */
function requireAuth(req: Request, res: Response, next: () => void): void {
  const userId = extractUserId(req.headers.authorization)
  if (!userId) {
    res.status(401).json({ success: false, error: '请先登录' })
    return
  }
  ;(req as any).userId = userId
  next()
}

router.use(requireAuth)

/**
 * POST /api/library
 * Body: { sourceQuery, entityName, entityType, cardType, cardPayload }
 *
 * 收藏卡片，同时触发图谱增量更新
 */
router.post('/', (req: Request, res: Response): void => {
  const userId = (req as any).userId as string
  const { sourceQuery, entityName, entityType, cardType, cardPayload } = req.body ?? {}

  if (!sourceQuery || !entityName || !cardType || !cardPayload) {
    res.status(400).json({ success: false, error: '缺少必要字段' })
    return
  }

  const db = getDb()
  const id = uuid()

  try {
    db.prepare(
      `INSERT INTO knowledge_items (id, user_id, source_query, entity_name, entity_type, card_type, card_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      sourceQuery,
      entityName,
      entityType || null,
      cardType,
      JSON.stringify(cardPayload),
    )

    // 异步触发图谱抽取（不阻塞响应）
    extractGraphFromCard(userId, {
      sourceQuery,
      entityName,
      entityType: entityType as EntityType | null,
      cardType: cardType as CardType,
      cardPayload: cardPayload as CardData,
    }).catch((err) => {
      console.warn('[library] 图谱抽取失败:', (err as Error).message)
    })

    res.json({ success: true, id })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

/**
 * GET /api/library
 * Query: ?cardType=verdict&entityType=HUMAN&q=马斯克
 */
router.get('/', (req: Request, res: Response): void => {
  const userId = (req as any).userId as string
  const { cardType, entityType, q } = req.query

  const db = getDb()
  let sql = 'SELECT * FROM knowledge_items WHERE user_id = ?'
  const params: string[] = [userId]

  if (cardType) {
    sql += ' AND card_type = ?'
    params.push(cardType as string)
  }
  if (entityType) {
    sql += ' AND entity_type = ?'
    params.push(entityType as string)
  }
  if (q) {
    sql += ' AND (entity_name LIKE ? OR source_query LIKE ? OR card_payload LIKE ?)'
    const kw = `%${q}%`
    params.push(kw, kw, kw)
  }

  sql += ' ORDER BY saved_at DESC'

  const rows = db.prepare(sql).all(...params) as any[]

  const items = rows.map((r) => ({
    id: r.id,
    sourceQuery: r.source_query,
    entityName: r.entity_name,
    entityType: r.entity_type,
    cardType: r.card_type,
    cardPayload: JSON.parse(r.card_payload),
    savedAt: r.saved_at,
  }))

  res.json({ success: true, items })
})

/**
 * GET /api/library/stats
 */
router.get('/stats', (req: Request, res: Response): void => {
  const userId = (req as any).userId as string
  const db = getDb()

  const total = (db.prepare('SELECT COUNT(*) as c FROM knowledge_items WHERE user_id = ?').get(userId) as any).c
  const byCardType = db
    .prepare('SELECT card_type, COUNT(*) as c FROM knowledge_items WHERE user_id = ? GROUP BY card_type')
    .all(userId) as any[]
  const byEntityType = db
    .prepare('SELECT entity_type, COUNT(*) as c FROM knowledge_items WHERE user_id = ? GROUP BY entity_type')
    .all(userId) as any[]
  const entities = (db.prepare('SELECT COUNT(*) as c FROM entities WHERE user_id = ?').get(userId) as any).c
  const relations = (db.prepare('SELECT COUNT(*) as c FROM relations WHERE user_id = ?').get(userId) as any).c

  res.json({
    success: true,
    stats: {
      totalItems: total,
      totalEntities: entities,
      totalRelations: relations,
      byCardType: byCardType.reduce((acc, r) => ({ ...acc, [r.card_type]: r.c }), {}),
      byEntityType: byEntityType.reduce((acc, r) => ({ ...acc, [r.entity_type]: r.c }), {}),
    },
  })
})

/**
 * DELETE /api/library/:id
 */
router.delete('/:id', (req: Request, res: Response): void => {
  const userId = (req as any).userId as string
  const { id } = req.params
  const db = getDb()

  const result = db.prepare('DELETE FROM knowledge_items WHERE id = ? AND user_id = ?').run(id, userId)

  if (result.changes === 0) {
    res.status(404).json({ success: false, error: '条目不存在或无权操作' })
    return
  }

  res.json({ success: true })
})

export default router

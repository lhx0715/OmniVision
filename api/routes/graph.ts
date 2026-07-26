/**
 * 知识图谱 API 路由
 *
 * GET /api/graph       — 获取用户完整图谱（节点+边）
 * GET /api/graph/stats — 图谱统计
 * POST /api/graph/merge — 合并两个实体节点
 */
import { Router, type Request, type Response } from 'express'
import { getDb } from '../db.js'
import { extractUserId } from '../services/authService.js'

const router = Router()

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
 * GET /api/graph
 * 返回用户完整知识图谱（力导向图渲染数据）
 */
router.get('/', (req: Request, res: Response): void => {
  const userId = (req as any).userId as string
  const db = getDb()

  // 查询所有节点，标记 isRoot（用户直接搜索过的实体 = knowledge_items.entity_name 匹配）
  const entityRows = db.prepare(
    `SELECT e.id, e.name, e.entity_type, e.source_query, e.created_at,
       CASE WHEN EXISTS (
         SELECT 1 FROM knowledge_items ki
         WHERE ki.user_id = e.user_id AND ki.entity_name = e.name
       ) THEN 1 ELSE 0 END AS is_root
     FROM entities e
     WHERE e.user_id = ?
     ORDER BY e.created_at`,
  ).all(userId) as any[]

  // 查询所有边
  const relationRows = db.prepare(
    `SELECT r.id, r.from_entity_id, r.to_entity_id, r.relation_type, r.source_card_type, r.source_query, r.created_at
     FROM relations r WHERE r.user_id = ? ORDER BY r.created_at`,
  ).all(userId) as any[]

  // 计算每个节点的度（边数），用于前端节点大小
  const degreeMap = new Map<string, number>()
  for (const r of relationRows) {
    degreeMap.set(r.from_entity_id, (degreeMap.get(r.from_entity_id) || 0) + 1)
    degreeMap.set(r.to_entity_id, (degreeMap.get(r.to_entity_id) || 0) + 1)
  }

  const nodes = entityRows.map((e) => ({
    id: e.id,
    label: e.name,
    entityType: e.entity_type,
    sourceQuery: e.source_query,
    degree: degreeMap.get(e.id) || 0,
    isRoot: e.is_root === 1,
    createdAt: e.created_at,
  }))

  const edges = relationRows.map((r) => ({
    id: r.id,
    source: r.from_entity_id,
    target: r.to_entity_id,
    label: r.relation_type,
    sourceCardType: r.source_card_type,
    sourceQuery: r.source_query,
    createdAt: r.created_at,
  }))

  res.json({ success: true, nodes, edges })
})

/**
 * GET /api/graph/stats
 */
router.get('/stats', (req: Request, res: Response): void => {
  const userId = (req as any).userId as string
  const db = getDb()

  const nodes = (db.prepare('SELECT COUNT(*) as c FROM entities WHERE user_id = ?').get(userId) as any).c
  const edges = (db.prepare('SELECT COUNT(*) as c FROM relations WHERE user_id = ?').get(userId) as any).c
  const byEntityType = db
    .prepare('SELECT entity_type, COUNT(*) as c FROM entities WHERE user_id = ? GROUP BY entity_type')
    .all(userId) as any[]
  const byRelationType = db
    .prepare('SELECT relation_type, COUNT(*) as c FROM relations WHERE user_id = ? GROUP BY relation_type ORDER BY c DESC LIMIT 10')
    .all(userId) as any[]

  res.json({
    success: true,
    stats: {
      nodes,
      edges,
      byEntityType: byEntityType.reduce((acc, r) => ({ ...acc, [r.entity_type]: r.c }), {}),
      byRelationType: byRelationType.reduce((acc, r) => ({ ...acc, [r.relation_type]: r.c }), {}),
    },
  })
})

/**
 * POST /api/graph/merge
 * 合并两个实体（用户手动消歧）
 * Body: { sourceId, targetId }
 */
router.post('/merge', (req: Request, res: Response): void => {
  const userId = (req as any).userId as string
  const { sourceId, targetId } = req.body ?? {}

  if (!sourceId || !targetId || sourceId === targetId) {
    res.status(400).json({ success: false, error: '参数无效' })
    return
  }

  const db = getDb()

  try {
    db.transaction(() => {
      // 将 source 的所有边迁移到 target
      db.prepare('UPDATE relations SET from_entity_id = ? WHERE from_entity_id = ? AND user_id = ?').run(targetId, sourceId, userId)
      db.prepare('UPDATE relations SET to_entity_id = ? WHERE to_entity_id = ? AND user_id = ?').run(targetId, sourceId, userId)
      // 删除自环边
      db.prepare('DELETE FROM relations WHERE from_entity_id = to_entity_id AND user_id = ?').run(userId)
      // 删除重复边（保留第一条）
      db.prepare(
        `DELETE FROM relations WHERE id NOT IN (
          SELECT MIN(id) FROM relations WHERE user_id = ? GROUP BY from_entity_id, to_entity_id, relation_type
        ) AND user_id = ?`,
      ).run(userId, userId)
      // 删除源节点
      db.prepare('DELETE FROM entities WHERE id = ? AND user_id = ?').run(sourceId, userId)
    })()

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router

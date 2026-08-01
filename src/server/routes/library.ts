import { Router, type Request, type Response } from 'express'
import { prisma, uuid } from '../db.js'
import { extractUserId } from '../services/authService.js'
import { extractGraphFromCard } from '../services/graphExtractor.js'
import type { EntityType, CardType, CardData } from '@shared/types.js'

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

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { sourceQuery, entityName, entityType, cardType, cardPayload, folderId } = req.body ?? {}

  if (!sourceQuery || !entityName || !cardType || !cardPayload) {
    res.status(400).json({ success: false, error: '缺少必要字段' })
    return
  }

  const id = uuid()

  try {
    await prisma.knowledgeItem.create({
      data: {
        id,
        userId,
        folderId: folderId || null,
        sourceQuery,
        entityName,
        entityType: entityType || null,
        cardType,
        cardPayload: JSON.stringify(cardPayload),
      },
    })

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

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { cardType, entityType, q, folderId } = req.query

  let where: Record<string, unknown> = { userId }
  if (cardType) where.cardType = cardType
  if (entityType) where.entityType = entityType
  // folderId 过滤：'null' 字符串 = 未分类；不传 = 全部
  if (folderId !== undefined) {
    where.folderId = folderId === 'null' ? null : folderId
  }

  try {
    const items = await prisma.knowledgeItem.findMany({
      where,
      orderBy: { savedAt: 'desc' },
    })

    let filtered = items
    if (q) {
      const kw = (q as string).toLowerCase()
      filtered = items.filter(
        (item) =>
          item.entityName.toLowerCase().includes(kw) ||
          item.sourceQuery.toLowerCase().includes(kw) ||
          item.cardPayload.toLowerCase().includes(kw),
      )
    }

    res.json({
      success: true,
      items: filtered.map((item) => ({
        id: item.id,
        sourceQuery: item.sourceQuery,
        entityName: item.entityName,
        entityType: item.entityType,
        cardType: item.cardType,
        cardPayload: JSON.parse(item.cardPayload),
        savedAt: item.savedAt.toISOString(),
      })),
    })
  } catch (err) {
    // Supabase 空闲连接被回收时 prisma 查询会抛错，Express 4 不会自动捕获，
    // 必须显式 try/catch 否则响应挂起、前端 Library 列表一直 loading。
    console.error('[library] 列表查询失败:', (err as Error).message)
    res.status(500).json({ success: false, error: '知识库列表暂时不可用，请稍后重试' })
  }
})

router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string

  try {
    const [total, byCardType, byEntityType, entities, relations] = await Promise.all([
      prisma.knowledgeItem.count({ where: { userId } }),
      prisma.knowledgeItem.groupBy({
        by: ['cardType'],
        where: { userId },
        _count: { cardType: true },
      }),
      prisma.knowledgeItem.groupBy({
        by: ['entityType'],
        where: { userId },
        _count: { entityType: true },
      }),
      prisma.entity.count({ where: { userId } }),
      prisma.relation.count({ where: { userId } }),
    ])

    res.json({
      success: true,
      stats: {
        totalItems: total,
        totalEntities: entities,
        totalRelations: relations,
        byCardType: byCardType.reduce((acc, r) => ({ ...acc, [r.cardType]: r._count.cardType }), {}),
        byEntityType: byEntityType.reduce((acc, r) => ({ ...acc, [r.entityType ?? 'null']: r._count.entityType }), {}),
      },
    })
  } catch (err) {
    console.error('[library] 统计查询失败:', (err as Error).message)
    res.status(500).json({ success: false, error: '统计数据暂时不可用，请稍后重试' })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { id } = req.params

  try {
    const result = await prisma.knowledgeItem.deleteMany({ where: { id, userId } })

    if (result.count === 0) {
      res.status(404).json({ success: false, error: '条目不存在或无权操作' })
      return
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[library] 删除失败:', (err as Error).message)
    res.status(500).json({ success: false, error: '删除失败，请稍后重试' })
  }
})

export default router

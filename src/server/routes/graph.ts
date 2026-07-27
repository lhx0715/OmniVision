import { Router, type Request, type Response } from 'express'
import { prisma } from '../db.js'
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

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string

  const [entities, relations] = await Promise.all([
    prisma.entity.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.relation.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const savedEntityNames = new Set(
    (await prisma.knowledgeItem.findMany({ where: { userId }, select: { entityName: true } })).map(
      (item) => item.entityName,
    ),
  )

  const degreeMap = new Map<string, number>()
  for (const r of relations) {
    degreeMap.set(r.fromEntityId, (degreeMap.get(r.fromEntityId) || 0) + 1)
    degreeMap.set(r.toEntityId, (degreeMap.get(r.toEntityId) || 0) + 1)
  }

  const nodes = entities.map((e) => ({
    id: e.id,
    label: e.name,
    entityType: e.entityType,
    sourceQuery: e.sourceQuery,
    degree: degreeMap.get(e.id) || 0,
    isRoot: savedEntityNames.has(e.name),
    createdAt: e.createdAt.toISOString(),
  }))

  const edges = relations.map((r) => ({
    id: r.id,
    source: r.fromEntityId,
    target: r.toEntityId,
    label: r.relationType,
    sourceCardType: r.sourceCardType,
    sourceQuery: r.sourceQuery,
    createdAt: r.createdAt.toISOString(),
  }))

  res.json({ success: true, nodes, edges })
})

router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string

  const [nodes, edges, byEntityType, byRelationType] = await Promise.all([
    prisma.entity.count({ where: { userId } }),
    prisma.relation.count({ where: { userId } }),
    prisma.entity.groupBy({
      by: ['entityType'],
      where: { userId },
      _count: { entityType: true },
    }),
    prisma.relation.groupBy({
      by: ['relationType'],
      where: { userId },
      _count: { relationType: true },
      orderBy: { _count: { relationType: 'desc' } },
      take: 10,
    }),
  ])

  res.json({
    success: true,
    stats: {
      nodes,
      edges,
      byEntityType: byEntityType.reduce((acc, r) => ({ ...acc, [r.entityType ?? 'null']: r._count.entityType }), {}),
      byRelationType: byRelationType.reduce((acc, r) => ({ ...acc, [r.relationType]: r._count.relationType }), {}),
    },
  })
})

router.post('/merge', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { sourceId, targetId } = req.body ?? {}

  if (!sourceId || !targetId || sourceId === targetId) {
    res.status(400).json({ success: false, error: '参数无效' })
    return
  }

  try {
    await prisma.$transaction([
      prisma.relation.updateMany({
        where: { userId, fromEntityId: sourceId },
        data: { fromEntityId: targetId },
      }),
      prisma.relation.updateMany({
        where: { userId, toEntityId: sourceId },
        data: { toEntityId: targetId },
      }),
      prisma.relation.deleteMany({
        where: { userId, fromEntityId: targetId, toEntityId: targetId },
      }),
    ])

    const duplicateEdges = await prisma.relation.groupBy({
      by: ['fromEntityId', 'toEntityId', 'relationType'],
      where: { userId },
      having: { id: { _count: { gt: 1 } } },
    })

    for (const edge of duplicateEdges) {
      const duplicates = await prisma.relation.findMany({
        where: { userId, fromEntityId: edge.fromEntityId, toEntityId: edge.toEntityId, relationType: edge.relationType },
        orderBy: { createdAt: 'asc' },
        skip: 1,
      })
      await prisma.relation.deleteMany({
        where: { id: { in: duplicates.map((d) => d.id) } },
      })
    }

    await prisma.entity.deleteMany({ where: { userId, id: sourceId } })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router

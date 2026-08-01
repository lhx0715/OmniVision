import { Router, type Request, type Response } from 'express'
import { prisma, uuid } from '../db.js'
import { extractUserId } from '../services/authService.js'
import { generateFolderGraph, getFolderGraph } from '../services/folderGraphGenerator.js'

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
 * 列出当前用户所有文件夹（含每个文件夹的卡片数、是否已生成图谱）
 *
 * 注意：必须 try/catch —— Express 4 不会自动捕获 async 路由的 rejection，
 * 否则 Supabase 空闲连接被回收时 prisma.findMany 抛错会冒泡为 unhandledRejection，
 * 且响应永远不发出，前端 Library 的 loadFolders 会一直挂起，
 * 表现为"新建的文件夹无法同步到知识库文件夹分类"。
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  try {
    const folders = await prisma.knowledgeFolder.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { items: true } },
        graph: {
          select: {
            id: true,
            nodeCount: true,
            edgeCount: true,
            version: true,
            generatedAt: true,
          },
        },
      },
    })

    res.json({
      success: true,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        color: f.color,
        sortOrder: f.sortOrder,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        itemCount: f._count.items,
        graph: f.graph
          ? {
              id: f.graph.id,
              nodeCount: f.graph.nodeCount,
              edgeCount: f.graph.edgeCount,
              version: f.graph.version,
              generatedAt: f.graph.generatedAt.toISOString(),
            }
          : null,
      })),
    })
  } catch (err) {
    console.error('[folders] 列表查询失败:', (err as Error).message)
    res.status(500).json({ success: false, error: '文件夹列表暂时不可用，请稍后重试' })
  }
})

/**
 * 新建文件夹（同名冲突返回 409）
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { name, description, color } = req.body ?? {}

  if (!name || !String(name).trim()) {
    res.status(400).json({ success: false, error: '文件夹名称不能为空' })
    return
  }

  try {
    const folder = await prisma.knowledgeFolder.create({
      data: {
        id: uuid(),
        userId,
        name: String(name).trim(),
        description: description?.trim() || null,
        color: color || null,
      },
    })
    res.json({
      success: true,
      folder: {
        id: folder.id,
        name: folder.name,
        description: folder.description,
        color: folder.color,
        sortOrder: folder.sortOrder,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
        itemCount: 0,
        graph: null,
      },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ success: false, error: '同名文件夹已存在' })
      return
    }
    console.error('[folders] 新建失败:', err.message)
    res.status(500).json({ success: false, error: '文件夹创建失败，请稍后重试' })
  }
})

/**
 * 改名 / 改描述 / 改颜色
 */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { id } = req.params
  const { name, description, color } = req.body ?? {}

  const data: Record<string, unknown> = { updatedAt: new Date() }
  if (name !== undefined) data.name = String(name).trim()
  if (description !== undefined) data.description = description?.trim() || null
  if (color !== undefined) data.color = color || null

  try {
    const result = await prisma.knowledgeFolder.updateMany({ where: { id, userId }, data })
    if (result.count === 0) {
      res.status(404).json({ success: false, error: '文件夹不存在或无权操作' })
      return
    }
    res.json({ success: true })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ success: false, error: '同名文件夹已存在' })
      return
    }
    console.error('[folders] 更新失败:', err.message)
    res.status(500).json({ success: false, error: '文件夹更新失败，请稍后重试' })
  }
})

/**
 * 删除文件夹（卡片 folderId 置 null，图谱级联删除）
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { id } = req.params

  try {
    const result = await prisma.knowledgeFolder.deleteMany({ where: { id, userId } })
    if (result.count === 0) {
      res.status(404).json({ success: false, error: '文件夹不存在或无权操作' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[folders] 删除失败:', (err as Error).message)
    res.status(500).json({ success: false, error: '文件夹删除失败，请稍后重试' })
  }
})

/**
 * 列出文件夹内卡片
 */
router.get('/:id/items', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { id } = req.params

  try {
    // 校验文件夹归属
    const folder = await prisma.knowledgeFolder.findUnique({ where: { id } })
    if (!folder || folder.userId !== userId) {
      res.status(404).json({ success: false, error: '文件夹不存在或无权操作' })
      return
    }

    const items = await prisma.knowledgeItem.findMany({
      where: { userId, folderId: id },
      orderBy: { savedAt: 'desc' },
    })

    res.json({
      success: true,
      items: items.map((item) => ({
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
    console.error('[folders] 卡片列表查询失败:', (err as Error).message)
    res.status(500).json({ success: false, error: '文件夹卡片暂时不可用，请稍后重试' })
  }
})

/**
 * 生成知识图谱（覆盖式，version 递增）
 */
router.post('/:id/generate-graph', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { id } = req.params

  try {
    const graph = await generateFolderGraph(userId, id)
    if (!graph) {
      res.status(404).json({ success: false, error: '文件夹不存在或无权操作' })
      return
    }
    res.json({ success: true, graph })
  } catch (err) {
    console.error('[folders] 生成图谱失败:', err)
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

/**
 * 拉取文件夹图谱快照
 */
router.get('/:id/graph', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { id } = req.params

  try {
    const graph = await getFolderGraph(userId, id)
    if (!graph) {
      res.json({ success: true, graph: null })
      return
    }
    res.json({ success: true, graph })
  } catch (err) {
    console.error('[folders] 图谱快照查询失败:', (err as Error).message)
    res.status(500).json({ success: false, error: '图谱快照暂时不可用，请稍后重试' })
  }
})

export default router

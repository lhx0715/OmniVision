import { Router, type Request, type Response } from 'express'
import { extractUserId } from '../services/authService.js'
import {
  createSession,
  getSession,
  listSessions,
  updateSession,
  deleteSession,
  getSessionGraph,
  deleteStep,
} from '../services/exploreGraph.js'
import { discoverAndMerge } from '../services/relationDiscovery.js'
import type { EntityType } from '@shared/types.js'

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

router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const sessions = await listSessions(userId)
  res.json({ success: true, sessions })
})

router.post('/sessions', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const { title, seedLabel, seedEntityType, seedFrom } = req.body ?? {}

  if (!seedLabel || typeof seedLabel !== 'string' || !seedLabel.trim()) {
    res.status(400).json({ success: false, error: 'seedLabel 不能为空' })
    return
  }

  try {
    const session = await createSession(userId, {
      title,
      seedLabel: seedLabel.trim(),
      seedEntityType: seedEntityType || null,
      seedFrom: seedFrom || 'manual',
    })
    res.json({ success: true, session })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const sessionId = req.params.id
  const data = await getSessionGraph(userId, sessionId)

  if (!data.session) {
    res.status(404).json({ success: false, error: '会话不存在' })
    return
  }

  res.json({ success: true, ...data })
})

router.patch('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const sessionId = req.params.id
  const { title, status } = req.body ?? {}

  if (status && status !== 'active' && status !== 'archived') {
    res.status(400).json({ success: false, error: 'status 必须为 active 或 archived' })
    return
  }

  const ok = await updateSession(userId, sessionId, { title, status })
  if (!ok) {
    res.status(404).json({ success: false, error: '会话不存在或无更新' })
    return
  }
  res.json({ success: true })
})

router.delete('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const sessionId = req.params.id
  const ok = await deleteSession(userId, sessionId)
  if (!ok) {
    res.status(404).json({ success: false, error: '会话不存在' })
    return
  }
  res.json({ success: true })
})

router.delete('/sessions/:id/steps/:index', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const sessionId = req.params.id
  const stepIndex = parseInt(req.params.index, 10)

  if (Number.isNaN(stepIndex) || stepIndex < 1) {
    res.status(400).json({ success: false, error: '步数必须为 >= 1 的整数' })
    return
  }

  try {
    const ok = await deleteStep(userId, sessionId, stepIndex)
    if (!ok) {
      res.status(404).json({ success: false, error: '该步不存在' })
      return
    }
    const data = await getSessionGraph(userId, sessionId)
    res.json({ success: true, ...data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post('/sessions/:id/ask', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).userId as string
  const sessionId = req.params.id
  const { targetNodeId, question } = req.body ?? {}

  if (!targetNodeId || typeof targetNodeId !== 'string') {
    res.status(400).json({ success: false, error: 'targetNodeId 不能为空' })
    return
  }
  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ success: false, error: 'question 不能为空' })
    return
  }

  const { session, nodes, edges } = await getSessionGraph(userId, sessionId)
  if (!session) {
    res.status(404).json({ success: false, error: '会话不存在' })
    return
  }

  const targetNode = nodes.find((n) => n.id === targetNodeId)
  if (!targetNode) {
    res.status(404).json({ success: false, error: '目标节点不存在' })
    return
  }

  const targetEntityType = (targetNode.entityType || 'ITEM') as EntityType
  const neighborLabels = edges
    .filter((e) => e.fromNodeId === targetNodeId || e.toNodeId === targetNodeId)
    .map((e) => {
      const otherId = e.fromNodeId === targetNodeId ? e.toNodeId : e.fromNodeId
      return nodes.find((n) => n.id === otherId)?.label
    })
    .filter((l): l is string => Boolean(l))

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  let closed = false
  const onClose = () => {
    closed = true
  }
  res.on('close', onClose)

  const safeWrite = (data: unknown): boolean => {
    if (closed || res.writableEnded) return false
    res.write(`data: ${JSON.stringify(data)}\n\n`)
    return true
  }

  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) {
      res.write(': keepalive\n\n')
    }
  }, 2000)

  try {
    const stepIndex = session.stepCount + 1

    safeWrite({ stage: 'planning', step: stepIndex })

    const result = await discoverAndMerge(
      userId,
      sessionId,
      targetNodeId,
      targetNode.label,
      targetEntityType,
      question.trim(),
      stepIndex,
      neighborLabels,
      (stage, data) => {
        if (closed) return
        if (stage === 'newNode') {
          safeWrite({ newNode: data })
        } else if (stage === 'newEdge') {
          safeWrite({ newEdge: data })
        } else {
          safeWrite({ stage, step: stepIndex, ...(data ? { data } : {}) })
        }
      },
    )

    clearInterval(heartbeat)

    safeWrite({
      stepSummary: result.answerSummary,
      sources: result.sources,
      step: stepIndex,
    })

    if (!closed) {
      safeWrite({
        done: true,
        step: stepIndex,
        addedNodes: result.addedNodes.length,
        addedEdges: result.addedEdges.length,
      })
    }
  } catch (err) {
    clearInterval(heartbeat)
    const message = err instanceof Error ? err.message : '关系发现失败'
    console.error('[explore/ask] 失败:', message)
    if (!closed) {
      safeWrite({ error: true, message })
    }
  } finally {
    if (!res.writableEnded) {
      res.end()
    }
  }
})

export default router

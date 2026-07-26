/**
 * C1 双实体对比摘要端点
 * POST /api/compare
 * 流式推送两个实体的对比摘要（markdown）
 *
 * 请求体: { queryA, cardsA, queryB, cardsB }
 * 响应: SSE 流式推送 { chunk } × N → { done: true }
 */
import { Router, type Request, type Response } from 'express'
import type { CardData, CardType } from '@shared/types.js'
import { hasLLM, streamWithLLM } from '../services/llmEngine.js'

const router = Router()

interface CompareRequest {
  queryA: string
  cardsA: Partial<Record<CardType, CardData>>
  queryB: string
  cardsB: Partial<Record<CardType, CardData>>
}

/**
 * POST /api/compare
 * 接收两个实体的 query 和卡片数据，流式返回对比摘要
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { queryA, cardsA, queryB, cardsB } = (req.body ?? {}) as CompareRequest

  // 参数校验
  if (!queryA || typeof queryA !== 'string' || !queryA.trim()) {
    res.status(400).json({ success: false, error: 'queryA 不能为空' })
    return
  }
  if (!queryB || typeof queryB !== 'string' || !queryB.trim()) {
    res.status(400).json({ success: false, error: 'queryB 不能为空' })
    return
  }

  if (!hasLLM()) {
    res.status(503).json({ success: false, error: '对比摘要需要配置 LLM_API_KEY' })
    return
  }

  // 统一设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  // 客户端断开检测 + 取消 LLM 请求
  let closed = false
  const controller = new AbortController()
  const onClose = () => {
    closed = true
    controller.abort()
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

  const systemPrompt = '你是「全知视野」情报分析助手。只输出 markdown，不输出任何前言或客套话。'
  const prompt = `对比分析以下两个实体。

## 实体A: ${queryA}
${JSON.stringify(cardsA, null, 2)}

## 实体B: ${queryB}
${JSON.stringify(cardsB, null, 2)}

## 输出要求
分别从以下维度对比：相同点、不同点、综合结论。markdown 格式，简洁有力，直击本质。禁止输出"基于您的要求""综上所述"等废话。`

  try {
    await streamWithLLM(
      prompt,
      systemPrompt,
      (chunk) => {
        safeWrite({ chunk })
      },
      controller.signal,
    )

    clearInterval(heartbeat)
    if (!closed) safeWrite({ done: true })
  } catch (err) {
    clearInterval(heartbeat)
    // 客户端断开导致的 abort 不发错误
    if (!controller.signal.aborted) {
      const message = err instanceof Error ? err.message : '对比摘要生成失败'
      safeWrite({ error: message })
    }
  } finally {
    clearInterval(heartbeat)
    res.off('close', onClose)
    if (!res.writableEnded) {
      res.end()
    }
  }
})

export default router

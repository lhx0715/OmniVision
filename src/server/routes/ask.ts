/**
 * B4 卡片追问端点
 * POST /api/ask
 * 流式推送基于卡片上下文的追问回答（markdown）
 *
 * 引擎：需配置 LLM_API_KEY，复用 llmEngine.streamWithLLM 流式生成
 */
import { Router, type Request, type Response } from 'express'
import type { CardData } from '@shared/types.js'
import { hasLLM, streamWithLLM } from '../services/llmEngine.js'

const router = Router()

type AskCardType = 'verdict' | 'darkside'

interface AskRequest {
  cardType: AskCardType
  payload: CardData
  query: string
  question: string
}

/**
 * POST /api/ask
 * 接收 { cardType, payload, query, question }，流式返回追问回答
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { cardType, payload, query, question } = (req.body ?? {}) as AskRequest

  // 参数校验
  if (!cardType || (cardType !== 'verdict' && cardType !== 'darkside')) {
    res.status(400).json({ success: false, error: 'cardType 无效，必须为 verdict/darkside' })
    return
  }
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ success: false, error: 'payload 不能为空' })
    return
  }
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ success: false, error: 'query 不能为空' })
    return
  }
  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ success: false, error: 'question 不能为空' })
    return
  }

  if (!hasLLM()) {
    res.status(503).json({ success: false, error: '追问功能需要配置 LLM_API_KEY' })
    return
  }

  // 统一设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  // 客户端断开检测 + 取消 LLM 请求
  // 注意：不能用 req.on('close')，它在 POST body 消费后就触发（几乎立即），
  // 不是真正的客户端断开。只用 res.on('close') 检测连接终止。
  let closed = false
  const controller = new AbortController()
  const onClose = () => {
    closed = true
    controller.abort()
  }
  res.on('close', onClose)

  /**
   * 安全写入：连接已断开时跳过
   */
  const safeWrite = (data: unknown): boolean => {
    if (closed || res.writableEnded) return false
    res.write(`data: ${JSON.stringify(data)}\n\n`)
    return true
  }

  /**
   * SSE 心跳：LLM 生成期间每 2 秒发送注释行，防止代理/客户端因空闲超时断开连接
   * （SSE 规范中 ':' 开头的行会被客户端忽略）
   */
  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) {
      res.write(': keepalive\n\n')
    }
  }, 2000)

  // 构建提示词
  const systemPrompt = '你是情报分析助手。直接回答问题，返回 markdown 格式。'
  const prompt = `你是情报分析助手。基于以下情报卡片内容回答用户问题。卡片类型：${cardType}。卡片内容：${JSON.stringify(payload)}。原查询目标：${query}。用户问题：${question}。直接回答，不要废话，返回 markdown 格式。`

  // 先发 loading:false（表示开始流式生成）
  safeWrite({ loading: false })

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
      const message = err instanceof Error ? err.message : '追问失败'
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

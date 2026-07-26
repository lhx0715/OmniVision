/**
 * B1 卡片深度展开端点
 * POST /api/expand
 * 流式推送卡片深度展开内容（markdown）
 *
 * 引擎：需配置 LLM_API_KEY，复用 llmEngine.streamWithLLM 流式生成
 */
import { Router, type Request, type Response } from 'express'
import type { CardData, EntityType } from '@shared/types.js'
import { hasLLM, streamWithLLM } from '../services/llmEngine.js'

const router = Router()

type ExpandCardType = 'timeline' | 'darkside' | 'gameplay'

interface ExpandRequest {
  cardType: ExpandCardType
  payload: CardData
  query: string
  entityType: EntityType
}

/** 不同卡片类型的深度展开指令 */
const EXPAND_PROMPTS: Record<ExpandCardType, string> = {
  timeline: '对以下时间线事件进行深度展开，每个事件补充完整背景、相关人物、影响链。返回 markdown 格式。',
  darkside: '对以下争议点进行深度展开，每个争议补充争议时间线、各方立场、处理结果。返回 markdown 格式。',
  gameplay: '对以下博弈方进行深度展开，补充博弈演进、关键转折、未来推演。返回 markdown 格式。',
}

/**
 * POST /api/expand
 * 接收 { cardType, payload, query, entityType }，流式返回深度展开内容
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { cardType, payload, query, entityType } = (req.body ?? {}) as ExpandRequest

  // 参数校验
  if (!cardType || !EXPAND_PROMPTS[cardType]) {
    res
      .status(400)
      .json({ success: false, error: 'cardType 无效，必须为 timeline/darkside/gameplay' })
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
  if (!entityType) {
    res.status(400).json({ success: false, error: 'entityType 不能为空' })
    return
  }

  if (!hasLLM()) {
    res.status(503).json({ success: false, error: '深度展开需要配置 LLM_API_KEY' })
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
  const systemPrompt = '你是「全知视野」情报分析助手。只输出 markdown，不输出任何前言或客套话。'
  const prompt = `${EXPAND_PROMPTS[cardType]}

## 原查询目标
${query}（类型：${entityType}）

## 卡片当前数据
${JSON.stringify(payload, null, 2)}`

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
      const message = err instanceof Error ? err.message : '深度展开失败'
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

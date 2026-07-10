/**
 * SSE 搜索端点
 * POST /api/search
 * 流式推送情报卡片
 *
 * 引擎选择：配置了 LLM_API_KEY → llmEngine（实时搜索+大模型）
 *           未配置             → mockEngine（本地知识库，Demo 模式）
 */
import { Router, type Request, type Response } from 'express'
import type { EntityType, SearchRequest, IntelCard, IntelSource } from '../../shared/types.js'
import { classifyIntentAsync, getClarifyOptions } from '../services/intentRouter.js'
import { hasLLM } from '../services/llmEngine.js'
import { generateIntelCards as mockGenerate } from '../services/mockEngine.js'
import { generateIntelCards as llmGenerate } from '../services/llmEngine.js'

const router = Router()

/**
 * 流式间隔范围（ms）
 * - LLM 模式：卡片生成即推送，间隔短（仅做渲染缓冲）
 * - Mock 模式：模拟网络延迟
 */
const STREAM_MIN_DELAY = 200
const STREAM_MAX_DELAY = 500

function randomDelay(): number {
  return Math.floor(Math.random() * (STREAM_MAX_DELAY - STREAM_MIN_DELAY + 1)) + STREAM_MIN_DELAY
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 根据配置选择引擎
 */
async function generateCards(
  query: string,
  entityType: EntityType,
): Promise<{ cards: IntelCard[]; sources: IntelSource[] }> {
  if (hasLLM()) {
    return llmGenerate(query, entityType)
  }
  return mockGenerate(query, entityType)
}

/**
 * POST /api/search
 * 接收 { query, entityType? }，流式返回情报卡片
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { query, entityType } = (req.body ?? {}) as SearchRequest

  // 参数校验
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ success: false, error: 'query 不能为空' })
    return
  }

  // 统一设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  // 推送引擎模式标识（前端可用于显示状态）
  const engineMode = hasLLM() ? 'live' : 'mock'
  res.write(`data: ${JSON.stringify({ engine: engineMode })}\n\n`)

  // 确定实体类型（异步分类：关键词快速路径 + LLM 兜底）
  let finalType: EntityType | null = entityType ?? null
  if (!finalType) {
    finalType = await classifyIntentAsync(query)
    // 模糊 → 通过 SSE 推送澄清选项
    if (!finalType) {
      res.write(`data: ${JSON.stringify({ needsClarify: true, options: getClarifyOptions(query) })}\n\n`)
      res.end()
      return
    }
  }

  // 客户端断开检测
  // 注意：不能用 req.on('close')，它在 POST body 消费后就触发（几乎立即），
  // 不是真正的客户端断开。只用 res.on('close') 检测连接终止。
  let closed = false
  const onClose = () => {
    closed = true
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

  try {
    const { cards, sources } = await generateCards(query, finalType)

    console.log(`[search] 生成完成: ${cards.length} 张卡片, ${sources.length} 个来源, closed=${closed}`)

    clearInterval(heartbeat)

    // 推送数据源列表（C4 溯源，在卡片之前）
    if (!closed && sources.length > 0) {
      safeWrite({ sources })
    }

    for (const card of cards) {
      if (closed) break
      // 渲染缓冲间隔
      await sleep(randomDelay())
      if (closed) break

      safeWrite({ cardType: card.cardType, payload: card.payload })
    }

    // 推送完成事件
    if (!closed) {
      safeWrite({ done: true, entityType: finalType })
    }
  } catch (err) {
    clearInterval(heartbeat)
    const message = err instanceof Error ? err.message : '生成情报卡片失败'

    // LLM 模式失败 → 自动降级到 mockEngine
    if (hasLLM()) {
      console.warn('[search] LLM 引擎失败，降级到 mockEngine:', message)
      try {
        const { cards: fallbackCards, sources: fallbackSources } = await mockGenerate(query, finalType)
        // 降级时也推送数据源（mock 模式通常为空）
        if (!closed && fallbackSources.length > 0) {
          safeWrite({ sources: fallbackSources })
        }
        for (const card of fallbackCards) {
          if (closed) break
          await sleep(randomDelay())
          if (closed) break
          safeWrite({ cardType: card.cardType, payload: card.payload })
        }
        if (!closed) safeWrite({ done: true, entityType: finalType })
      } catch (fallbackErr) {
        safeWrite({
          error: `LLM 与回退引擎均失败: ${(fallbackErr as Error).message}`,
        })
      }
    } else {
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

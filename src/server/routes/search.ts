/**
 * SSE 搜索端点
 * POST /api/search
 * 流式推送情报卡片
 *
 * 引擎选择：配置了 LLM_API_KEY → llmEngine（实时搜索+大模型）
 *           未配置             → mockEngine（本地知识库，Demo 模式）
 */
import { Router, type Request, type Response } from 'express'
import type { EntityType, SearchRequest, IntelCard, IntelSource } from '@shared/types.js'
import { classifyIntentAsync, getClarifyOptionsAsync } from '../services/intentRouter.js'
import { hasLLM } from '../services/llmEngine.js'
import { generateIntelCards as mockGenerate } from '../services/mockEngine.js'
import { generateIntelCardsWithAgent } from '../services/llmEngine.js'
import { classifyIntent } from '../services/riskGuard.js'

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

  // ===== 第一重防护：搜索词前置风控校验 + 意图分类 + 信源路由 =====
  // Class A（违规）→ 直接拦截
  // Class B（政治敏感）→ 允许搜索，强制权威白名单
  // Class C（科普通用）→ 允许搜索，排除垃圾源
  const intent = await classifyIntent(query)
  if (intent.intent === 'A') {
    res.write(`data: ${JSON.stringify({ blocked: true, reason: intent.blockReason, layer: intent.layer })}\n\n`)
    res.end()
    return
  }

  // 推送引擎模式标识（前端可用于显示状态）
  const engineMode = hasLLM() ? 'live' : 'mock'
  res.write(`data: ${JSON.stringify({ engine: engineMode })}\n\n`)

  // 确定实体类型（异步分类：关键词快速路径 + LLM 兜底）
  let finalType: EntityType | null = entityType ?? null
  if (!finalType) {
    finalType = await classifyIntentAsync(query)
    // 模糊 → 通过 SSE 推送澄清选项
    if (!finalType) {
      const options = await getClarifyOptionsAsync(query)
      res.write(`data: ${JSON.stringify({ needsClarify: true, options })}\n\n`)
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
    // ===== Agent 模式（LLM 可用时）：ReAct 多轮研究 =====
    // 每步通过 SSE 推送 agent_step 进度事件，前端进度条据此动态更新
    let cards: IntelCard[]
    let sources: IntelSource[]
    let images: string[]
    let sourceStats: { totalSources: number; bySource: Record<string, number>; coveredDimensions: string[]; timeSpan?: { earliest?: string; latest?: string } } | null = null

    if (hasLLM()) {
      const result = await generateIntelCardsWithAgent(
        query,
        finalType,
        {
          includeDomains: intent.includeDomains,
          excludeDomains: intent.excludeDomains,
        },
        (event) => {
          // 推送 agent 进度事件
          if (!closed && !res.writableEnded) {
            res.write(`data: ${JSON.stringify(event)}\n\n`)
          }
        },
      )
      cards = result.cards
      sources = result.sources
      images = result.images
      sourceStats = result.sourceStats
    } else {
      const result = await mockGenerate(query, finalType)
      cards = result.cards
      sources = result.sources
      images = result.images
    }

    console.log(`[search] 生成完成: ${cards.length} 张卡片, ${sources.length} 个来源, ${images.length} 张图片, closed=${closed}`)

    clearInterval(heartbeat)

    // 推送数据源列表（C4 溯源，在卡片之前）
    if (!closed && sources.length > 0) {
      safeWrite({ sources })
    }

    // PRD-01 M3：推送信源构成统计（供前端"深度感知"展示）
    // 在 sources 之后、images 之前，让前端先拿到信源构成再渲染构成条
    if (!closed && sourceStats) {
      safeWrite({ source_stats: sourceStats })
    }

    // 推送图片列表（在 sources 之后、卡片循环之前）
    if (!closed && images.length > 0) {
      safeWrite({ images })
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
        const { cards: fallbackCards, sources: fallbackSources, images: fallbackImages } = await mockGenerate(query, finalType)
        if (!closed && fallbackSources.length > 0) {
          safeWrite({ sources: fallbackSources })
        }
        if (!closed && fallbackImages.length > 0) {
          safeWrite({ images: fallbackImages })
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

/**
 * 缓存预热脚本（承载优化）
 *
 * 比赛前对运行中的后端批量发起搜索请求，触发 search.ts 的全链路缓存写入。
 * 比赛时评委搜同一批热词 → 缓存命中 → 0 次 LLM/搜索 API 调用，秒级返回。
 *
 * 用法：
 *   1. 先启动后端：npm run dev（前端 5173 + 后端 3001）
 *   2. 另开终端：node scripts/prewarm-cache.js
 *
 * 可选环境变量：
 *   BACKEND_URL=http://localhost:3001   后端地址
 *   PREWARM_CONCURRENCY=1                并发数（默认 1，串行避免压垮免费档 API）
 *
 * 注意：首次预热会真实消耗 LLM + 搜索 API 配额（每个词约 5-7 次 LLM、6-18 次搜索）。
 *       预热完成后 24h 内相同查询全部走缓存。
 */
// ESM 兼容（package.json type:module 下 .js 默认 ESM）
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'
const CONCURRENCY = Number(process.env.PREWARM_CONCURRENCY) || 1

/**
 * 预热词表。带 entityType 可跳过意图分类/澄清流程，直接生成卡片。
 * 比赛前按演示场景调整此列表。
 */
const TERMS = [
  { query: '英伟达', entityType: 'ITEM' },
  { query: 'OpenAI', entityType: 'ITEM' },
  { query: '特斯拉', entityType: 'ITEM' },
  { query: '华为', entityType: 'ITEM' },
  { query: '字节跳动', entityType: 'ITEM' },
  { query: 'DeepSeek', entityType: 'ITEM' },
  { query: '马斯克', entityType: 'HUMAN' },
  { query: '黄仁勋', entityType: 'HUMAN' },
  { query: 'ChatGPT', entityType: 'ITEM' },
  { query: '苹果公司', entityType: 'ITEM' },
]

/**
 * 对单个词发起 SSE 搜索，读到 done/error/needsClarify 即结束。
 * @returns {status: 'cached'|'skipped'|'failed', detail: string}
 */
async function prewarmOne(term) {
  const res = await fetch(`${BACKEND_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: term.query, entityType: term.entityType }),
  })

  if (!res.ok || !res.body) {
    return { status: 'failed', detail: `HTTP ${res.status}` }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = { status: 'failed', detail: '未收到结束事件' }

  while (true) {
    const { value, done: streamDone } = await reader.read()
    if (streamDone) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 以 \n\n 分帧，逐帧解析 data:
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!dataLine) continue
      const payload = dataLine.slice(5).trim()
      if (!payload) continue

      try {
        const evt = JSON.parse(payload)
        if (evt.done) {
          result = { status: 'cached', detail: evt.cached ? '命中已有缓存' : '新写入缓存' }
          return result
        }
        if (evt.needsClarify) {
          result = { status: 'skipped', detail: '触发澄清流程，跳过（词太模糊）' }
          return result
        }
        if (evt.blocked) {
          result = { status: 'skipped', detail: `被风控拦截：${evt.reason ?? ''}` }
          return result
        }
        if (evt.error) {
          result = { status: 'failed', detail: evt.error }
          return result
        }
      } catch {
        // 非 JSON 帧（如心跳注释），忽略
      }
    }
  }
  return result
}

// 并发限流执行器（与 researchAgent 风格一致）
async function runPool(items, concurrency, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

async function main() {
  console.log(`[prewarm] 后端: ${BACKEND_URL} | 词表: ${TERMS.length} 个 | 并发: ${CONCURRENCY}`)
  console.log('[prewarm] 开始预热（首次会真实消耗 LLM/搜索 API 配额）...\n')

  const start = Date.now()
  const results = await runPool(TERMS, CONCURRENCY, async (term, i) => {
    const t0 = Date.now()
    try {
      const r = await prewarmOne(term)
      const ms = Date.now() - t0
      const tag =
        r.status === 'cached' ? '✓' : r.status === 'skipped' ? '○' : '✗'
      console.log(`  [${i + 1}/${TERMS.length}] ${tag} ${term.query.padEnd(12)} ${r.status} (${ms}ms) ${r.detail}`)
      return r
    } catch (err) {
      const ms = Date.now() - t0
      console.log(`  [${i + 1}/${TERMS.length}] ✗ ${term.query.padEnd(12)} 异常 (${ms}ms) ${err.message}`)
      return { status: 'failed', detail: err.message }
    }
  })

  const cached = results.filter((r) => r.status === 'cached').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed').length
  const total = (Date.now() - start) / 1000

  console.log(`\n[prewarm] 完成：${cached} 写入 / ${skipped} 跳过 / ${failed} 失败，耗时 ${total.toFixed(1)}s`)
  if (cached > 0) {
    console.log('[prewarm] 这些词在 24h 内再次搜索将命中缓存，0 次 LLM/搜索 API 调用。')
  }
}

main().catch((err) => {
  console.error('[prewarm] 致命错误:', err.message)
  console.error('请确认后端已启动：npm run dev')
  process.exit(1)
})

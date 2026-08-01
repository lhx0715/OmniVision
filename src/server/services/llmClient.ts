/**
 * LLM 调用客户端 + JSON 稳健解析（共享底层工具）
 *
 * 从 researchAgent.ts 抽取，供 queryPlanner / confidence / 未来模块复用，
 * 避免与 researchAgent 形成循环依赖。
 */
import { fetchWithTimeout, isAbortError } from './httpUtils.js'

function cfg() {
  return {
    LLM_API_KEY: process.env.LLM_API_KEY ?? '',
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
    LLM_MODEL: process.env.LLM_MODEL ?? 'deepseek-chat',
  }
}

/** callLLM 默认超时：30s。DeepSeek 常规响应 3-15s，observeResults(maxTokens=1500) 偶尔接近 20s。 */
const DEFAULT_LLM_TIMEOUT_MS = 30000

/**
 * 调用 OpenAI 兼容 LLM 接口。
 * 失败抛错，由调用方 catch 兜底。
 *
 * @param options.timeoutMs 请求超时（默认 30s）。超时抛 Error('LLM 请求超时')，
 *   避免网络 stall / 限流不响应导致 Agent 循环永久挂起。
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: { temperature?: number; maxTokens?: number; jsonMode?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } = cfg()
  if (!LLM_API_KEY) throw new Error('LLM_API_KEY 未配置')

  const body: Record<string, unknown> = {
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: options.temperature ?? 0.3,
  }
  if (options.maxTokens) body.max_tokens = options.maxTokens
  if (options.jsonMode) body.response_format = { type: 'json_object' }

  let res: Response
  try {
    res = await fetchWithTimeout(
      `${LLM_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(body),
      },
      options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    )
  } catch (err) {
    if (isAbortError(err)) throw new Error('LLM 请求超时')
    throw err
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`LLM 请求失败: HTTP ${res.status} ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * 从 LLM 返回内容中稳健提取 JSON 对象。
 * 依次尝试：纯 JSON → 去 markdown 代码块 → 提取首个 {...} → 截断回退。
 * 任一成功即返回；全部失败则抛错，由调用方 catch 兜底。
 *
 * 解决 DeepSeek 等模型在 json_mode 下偶发包裹 ```json``` 或因 maxTokens 截断的问题。
 */
export function extractJSON(content: string): unknown {
  const trimmed = (content ?? '').trim()
  if (!trimmed) throw new Error('LLM 返回空内容')

  // 1. 直接是合法 JSON
  try {
    return JSON.parse(trimmed)
  } catch {
    /* 继续 */
  }

  // 2. 去除 markdown 代码块包裹（```json ... ``` 或 ``` ... ```）
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim())
    } catch {
      /* 继续 */
    }
  }

  // 3. 提取首个完整 {...} 块（容忍前后说明文字）
  const start = trimmed.indexOf('{')
  if (start !== -1) {
    let depth = 0
    let end = -1
    for (let i = start; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++
      else if (trimmed[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end !== -1) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        /* 继续 */
      }
    }

    // 4. 截断兜底：从首个 { 到末尾，逐步回退末尾 } 尝试解析
    const partial = trimmed.slice(start)
    for (let i = partial.length - 1; i >= 0; i--) {
      if (partial[i] === '}') {
        try {
          return JSON.parse(partial.slice(0, i + 1))
        } catch {
          /* 继续 */
        }
      }
    }
  }

  throw new Error('无法从 LLM 输出中提取 JSON')
}

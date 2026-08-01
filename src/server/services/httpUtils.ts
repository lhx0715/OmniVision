/**
 * HTTP 共享工具
 *
 * 提供 fetch 超时封装，避免 LLM / 搜索适配器的 fetch 因网络 stall 或限流不响应而永久挂起。
 * 超时后 abort 并抛出 AbortError，由调用方 catch 兜底（降级返回空 / 走 fallback）。
 */

/**
 * 带超时的 fetch。超时后通过 AbortController 中止请求。
 *
 * @param url 请求地址
 * @param init fetch init（内部会合并 signal，调用方无需传入）
 * @param timeoutMs 超时毫秒，默认 15s
 * @throws 超时抛出 DOMException('The operation was aborted.')（name='AbortError'）
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // 合并 signal：若调用方也传了 signal，此处以外层 timeout 为准（适配器均未传 signal）
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 判断错误是否为超时 abort（供调用方区分降级日志）。
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

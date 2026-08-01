/**
 * 配额熔断中间件（大会流量保护层）
 *
 * 保护单一搜索源被限流（429/432）后拖垮整体召回：
 * - 适配器在收到限流响应时调用 markRateLimited(name)
 * - registry 调用前检查 isAvailable(name)，熔断期间直接跳过该源
 * - 熔断超时后自动恢复（半开，允许试探请求）
 *
 * 状态仅存内存（进程级），重启重置——这是保护层，非持久化配额计费。
 * 真正的"零成本"由 FinalCardCache（24h TTL）+ 缓存预热承担，
 * 本层负责在缓存未命中、突发流量打爆某个源时，让流量自动落到其他免费源。
 */
import type { SourceName } from './sources/types.js'

interface CircuitState {
  openUntil: number // 熔断恢复时间戳(ms)；0 = 闭合
  consecutiveTrips: number // 连续熔断次数（用于指数退避）
  lastTripReason: string // 最近一次熔断原因（日志用）
  lastTripAt: string // 最近一次熔断时间（ISO）
  totalTrips: number // 累计熔断次数（监控用）
  totalSuccess: number // 累计成功次数（监控用）
}

const states = new Map<SourceName, CircuitState>()

const DEFAULT_COOLDOWN_MS = 60_000 // 默认熔断 60s
const MAX_COOLDOWN_MS = 5 * 60_000 // 退避上限 5min

function getState(name: SourceName): CircuitState {
  let s = states.get(name)
  if (!s) {
    s = {
      openUntil: 0,
      consecutiveTrips: 0,
      lastTripReason: '',
      lastTripAt: '',
      totalTrips: 0,
      totalSuccess: 0,
    }
    states.set(name, s)
  }
  return s
}

/**
 * 检查某源当前是否可用（未处于熔断状态）。
 * registry 在调用适配器前调用；返回 false 时直接跳过该源，不发起请求。
 *
 * 熔断超时后自动恢复为"半开"状态——允许下一次真实请求作为试探，
 * 若再次限流则由 markRateLimited 重新熔断（退避时间翻倍）。
 */
export function isAvailable(name: SourceName): boolean {
  const s = getState(name)
  if (s.openUntil === 0) return true
  if (Date.now() >= s.openUntil) {
    // 熔断已超时，自动恢复（半开：允许试探请求）
    s.openUntil = 0
    return true
  }
  return false
}

/**
 * 标记某源被限流/熔断。
 * 适配器在收到 HTTP 429/432 或明确的配额耗尽信号时调用。
 *
 * @param retryAfterSec 上游 Retry-After 头指定的恢复秒数；不传则按指数退避
 * @param reason 熔断原因（如 'HTTP 432'），用于日志
 */
export function markRateLimited(name: SourceName, retryAfterSec?: number, reason?: string): void {
  const s = getState(name)
  s.consecutiveTrips += 1
  s.totalTrips += 1
  s.lastTripReason = reason ?? 'rate-limited'
  s.lastTripAt = new Date().toISOString()

  let cooldown: number
  if (retryAfterSec && retryAfterSec > 0) {
    cooldown = retryAfterSec * 1000
  } else {
    // 指数退避：60s, 120s, 240s ... 上限 5min
    cooldown = Math.min(
      DEFAULT_COOLDOWN_MS * Math.pow(2, s.consecutiveTrips - 1),
      MAX_COOLDOWN_MS,
    )
  }
  s.openUntil = Date.now() + cooldown
  console.warn(
    `[quotaGuard] ${name} 触发熔断，冷却 ${Math.round(cooldown / 1000)}s` +
      `（连续第 ${s.consecutiveTrips} 次，原因: ${s.lastTripReason}）`,
  )
}

/**
 * 记录某源调用成功，重置连续熔断计数。
 * 适配器成功返回结果后调用（可选），让退避计数回归，避免历史抖动长期放大冷却时间。
 */
export function recordSuccess(name: SourceName): void {
  const s = getState(name)
  s.totalSuccess += 1
  if (s.consecutiveTrips > 0) {
    s.consecutiveTrips = 0
  }
}

/**
 * 解析 HTTP 响应的 Retry-After 头（秒）。
 * 兼容 delta-seconds 与 HTTP-date 两种格式（后者按与当前时间差计算）。
 */
export function parseRetryAfter(res: Response): number | undefined {
  const val = res.headers.get('retry-after')
  if (!val) return undefined
  const sec = parseInt(val, 10)
  if (Number.isFinite(sec) && sec > 0) return sec
  // HTTP-date 格式
  const date = Date.parse(val)
  if (Number.isFinite(date)) {
    const diff = Math.ceil((date - Date.now()) / 1000)
    return diff > 0 ? diff : undefined
  }
  return undefined
}

/**
 * 获取所有源的健康状态（供监控/日志端点使用）。
 */
export function getHealthStatus(): Record<
  string,
  {
    available: boolean
    consecutiveTrips: number
    totalTrips: number
    totalSuccess: number
    openUntil: string | null
    lastTripReason: string
    lastTripAt: string
  }
> {
  const result: Record<string, {
    available: boolean
    consecutiveTrips: number
    totalTrips: number
    totalSuccess: number
    openUntil: string | null
    lastTripReason: string
    lastTripAt: string
  }> = {}
  for (const [name, s] of states) {
    result[name] = {
      available: isAvailable(name),
      consecutiveTrips: s.consecutiveTrips,
      totalTrips: s.totalTrips,
      totalSuccess: s.totalSuccess,
      openUntil: s.openUntil ? new Date(s.openUntil).toISOString() : null,
      lastTripReason: s.lastTripReason,
      lastTripAt: s.lastTripAt,
    }
  }
  return result
}

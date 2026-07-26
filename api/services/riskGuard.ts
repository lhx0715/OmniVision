/**
 * 智能意图分流与信源风控系统
 *
 * 三类意图分类：
 *   Class A（绝对违规）→ 直接拦截，不调用搜索
 *   Class B（政治敏感）→ 允许搜索，强制权威白名单信源
 *   Class C（科普通用）→ 允许搜索，排除垃圾黑名单信源
 *
 * 部署位置：后端 /api/search 入口，在 Tavily/LLM 生成之前执行
 */
import { localDictCheck, type RiskCheckResult } from '../../shared/riskDict.js'

function cfg() {
  return {
    LLM_API_KEY: process.env.LLM_API_KEY ?? '',
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    LLM_MODEL: process.env.LLM_MODEL ?? 'gpt-4o',
    LLM_ROUTER_MODEL: process.env.LLM_ROUTER_MODEL ?? '',
  }
}

function hasLLM(): boolean {
  return Boolean(process.env.LLM_API_KEY)
}

// ===== 意图分类结果 =====

export type IntentClass = 'A' | 'B' | 'C'

export interface IntentClassification {
  intent: IntentClass
  /** Class A 命中时为拦截原因 */
  blockReason?: string
  /** Class B 时返回权威信源白名单 */
  includeDomains?: string[]
  /** Class C 时返回垃圾信源黑名单 */
  excludeDomains?: string[]
  /** 命中层级，用于日志 */
  layer: 'dict' | 'llm' | 'pass'
}

// ===== 权威信源白名单（Class B 政治敏感话题）=====

/**
 * 中国国内官方权威媒体，用于政治人物/敏感事件搜索
 * 仅从这些信源获取信息，确保内容合规、准确
 */
const AUTHORITATIVE_DOMAINS: string[] = [
  'xinhuanet.com',        // 新华网
  'people.com.cn',        // 人民网
  'cctv.com',             // 央视网
  'gov.cn',               // 中国政府网
  'china.com.cn',         // 中国网
  'npc.gov.cn',           // 全国人大
  'cppcc.gov.cn',         // 全国政协
  '12371.cn',             // 共产党员网
  'qstheory.cn',          // 求是网
  'gmw.cn',               // 光明网
  'chinadaily.com.cn',    // 中国日报
  'globaltimes.cn',       // 环球时报
  'baike.baidu.com',      // 百度百科（百科性信息）
  'zh.wikipedia.org',     // 维基百科中文（百科性信息）
]

// ===== 垃圾信源黑名单（Class C 通用搜索排除）=====

/**
 * 已知的内容农场、低质量聚合站、虚假信息高发源
 * 通用搜索时排除，提高信息准确率
 */
const LOW_QUALITY_DOMAINS: string[] = [
  'zhihu.com/questions',  // 知乎问答（质量参差，摘要不可靠）
  'baijiahao.baidu.com',  // 百家号（内容农场）
  'toutiao.com',          // 今日头条（标题党高发）
  'sohu.com',             // 搜狐号（自媒体聚合）
  '360doc.com',           // 个人图书馆
  '51test.net',           // 试题站
  'wendangku.com',        // 文档库
  'docin.com',            // 豆丁
  'doc88.com',            // 道客巴巴
  'book118.com',          // 图书馆
  'pinterest.com',        // Pinterest（非信息源）
  'reddit.com',           // Reddit（论坛讨论，非权威）
  'quora.com',            // Quora（同上）
]

// ===== 本地字典：绝对违规词（Class A）=====

/**
 * 绝对违规关键词 — 仅匹配"违规入口/交易/教唆"类
 *
 * 注意：赌博、毒品本身的"科普/法律/危害"讨论不属于 Class A
 *   - "赌博网站入口" → Class A（违规入口）
 *   - "赌博的法律处罚" → Class C（科普，放行搜索）
 *   - "买毒品" → Class A（违规交易）
 *   - "毒品的危害" → Class C（科普，放行搜索）
 *
 * 字典在 shared/riskDict.ts 中维护，这里复用
 */

// ===== LLM 意图分类 Prompt =====

const INTENT_CLASSIFY_PROMPT = `你是搜索意图分类器。判断用户查询属于以下哪一类：

## Class A（绝对违规，直接拦截）
- 色情网站入口、AV 下载、色情直播
- 赌博网站入口、赌资交易、博彩下注
- 毒品交易、买卖毒品、制毒方法
- 暴恐、分裂主义、恐怖袭击实施指导
- 违法行为教唆（诈骗教程、黑客攻击、盗号）
- 未成年人不当内容

## Class B（政治敏感，限制信源）
- 中国现任或前任国家领导人、高层政治人物
- 敏感政治事件、政治运动、重大历史政治事件
- 涉及政治立场的争议性话题
- 民族、宗教冲突的煽动性讨论

## Class C（科普通用，排除垃圾源）
- 科技、商业、文化、历史、百科性查询
- "赌博的危害""毒品的法律处罚"等科普性讨论
- 产品、技术、公司、普通人物查询
- 一切不属于 A 和 B 的正常查询

## 判定要点
- "赌博""毒品"等词本身不违规，看意图是"获取违规入口"还是"科普了解"
- 历史政治人物（如毛泽东）属于 B，需限制信源但允许搜索
- 现任国家领导人属于 B

## 输出格式
严格输出 JSON：
{"intent": "A" | "B" | "C", "reason": "拦截原因（仅 Class A 时填写）"}

Class B 和 C 时 reason 为空字符串。`

// ===== LLM 意图分类调用 =====

/**
 * LLM 意图分类（Smart Path）
 *
 * 将 Query 送入 LLM 做意图分类。
 * 延迟目标：<500ms（使用路由模型 + 极小 max_tokens）。
 *
 * @returns IntentClass — LLM 不可用时降级为 C（放行通用搜索）
 */
export async function classifyIntentWithLLM(query: string): Promise<{ intent: IntentClass; reason?: string } | null> {
  if (!hasLLM()) {
    return null
  }

  const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_ROUTER_MODEL } = cfg()
  const routerModel = LLM_ROUTER_MODEL || LLM_MODEL

  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: routerModel,
        messages: [
          { role: 'system', content: INTENT_CLASSIFY_PROMPT },
          { role: 'user', content: query },
        ],
        temperature: 0,
        max_tokens: 80,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      console.warn(`[riskGuard] LLM 意图分类请求失败: HTTP ${res.status}`)
      return null
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''

    let parsed: { intent?: string; reason?: string }
    try {
      parsed = JSON.parse(content)
    } catch {
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) {
        console.warn('[riskGuard] LLM 意图分类返回非 JSON')
        return null
      }
      parsed = JSON.parse(match[0])
    }

    const intent = (parsed.intent || 'C').toUpperCase()
    if (intent === 'A' || intent === 'B' || intent === 'C') {
      return { intent, reason: parsed.reason }
    }
    return { intent: 'C' }
  } catch (err) {
    console.warn('[riskGuard] LLM 意图分类异常:', (err as Error).message)
    return null
  }
}

// ===== 组合入口：意图分类 + 信源路由 =====

/**
 * 搜索词前置意图分类与信源路由
 *
 * 执行顺序：
 *   1. localDictCheck — 本地字典快审（同步，<1ms）
 *      命中 Class A 违规词 → 直接拦截
 *   2. classifyIntentWithLLM — LLM 意图分类（异步，~300ms）
 *      A → 拦截
 *      B → 返回权威白名单 include_domains
 *      C → 返回垃圾黑名单 exclude_domains
 *
 * @returns IntentClassification
 */
export async function classifyIntent(query: string): Promise<IntentClassification> {
  // 第一重：本地字典（Fast Path）— 只拦截绝对违规入口词
  const dictResult = localDictCheck(query)
  if (dictResult.blocked) {
    console.log(`[riskGuard] 本地字典拦截(Class A): "${query}" → 命中 "${dictResult.matchedKeyword}"`)
    return {
      intent: 'A',
      blockReason: dictResult.reason,
      layer: 'dict',
    }
  }

  // 第二重：LLM 意图分类（Smart Path）
  const llmResult = await classifyIntentWithLLM(query)

  if (llmResult) {
    if (llmResult.intent === 'A') {
      console.log(`[riskGuard] LLM 分类拦截(Class A): "${query}" → ${llmResult.reason}`)
      return {
        intent: 'A',
        blockReason: llmResult.reason || '输入内容包含敏感或受限主题，请修改后重试',
        layer: 'llm',
      }
    }

    if (llmResult.intent === 'B') {
      console.log(`[riskGuard] LLM 分类(Class B 政治敏感，限制信源): "${query}"`)
      return {
        intent: 'B',
        includeDomains: AUTHORITATIVE_DOMAINS,
        layer: 'llm',
      }
    }
  }

  // Class C 或 LLM 不可用时降级
  console.log(`[riskGuard] 分类(Class C 通用搜索，排除垃圾源): "${query}"`)
  return {
    intent: 'C',
    excludeDomains: LOW_QUALITY_DOMAINS,
    layer: llmResult ? 'llm' : 'pass',
  }
}

// ===== 向后兼容：reviewQuery（旧接口，内部转发到 classifyIntent）=====

/**
 * @deprecated 使用 classifyIntent 替代
 */
export async function reviewQuery(query: string): Promise<RiskCheckResult & { layer: 'dict' | 'llm' | 'pass' }> {
  const result = await classifyIntent(query)
  if (result.intent === 'A') {
    return { blocked: true, reason: result.blockReason || '输入内容包含敏感或受限主题，请修改后重试', layer: result.layer }
  }
  return { blocked: false, reason: '', layer: result.layer }
}

// ===== 后置过滤：数据源文本清洗 =====

const BANNED_URL_PATTERNS: readonly RegExp[] = [
  /pornhub\.com/i,
  /xvideos\.com/i,
  /xnxx\.com/i,
  /\.onion\b/i,
  /tottenhamcourtroad\.com/i,
]

/**
 * 过滤搜索来源列表，剔除违规数据源
 */
export function filterSources(
  sources: { title: string; url: string }[],
): { title: string; url: string }[] {
  return sources.filter((src) => {
    if (BANNED_URL_PATTERNS.some((re) => re.test(src.url))) return false
    const titleCheck = localDictCheck(src.title)
    if (titleCheck.blocked) return false
    return true
  })
}

/**
 * 后置防护 — 对 LLM 最终生成文本做二次敏感词扫描
 */
export function sanitizeGeneratedText(text: string): string {
  const result = localDictCheck(text)
  if (result.blocked) {
    console.warn(`[riskGuard] 生成内容命中敏感词: "${result.matchedKeyword}"，已过滤`)
    return '该内容因合规原因暂不展示'
  }
  return text
}

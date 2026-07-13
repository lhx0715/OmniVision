/**
 * 意图分类器
 * - 关键词规则做 0ms 快速路径
 * - LLM 零样本分类做兜底（需要配置 API key）
 */
import type { EntityType, ClarifyOption } from '../../shared/types.js'
import { hasLLM, classifyIntentWithLLM, clarifyOptionsWithLLM } from './llmEngine.js'

// 已知人物名（含中英文及别名）
const KNOWN_HUMANS = [
  '马斯克', 'elon musk', 'musk',
  '乔布斯', 'steve jobs', 'jobs',
  '扎克伯格', 'mark zuckerberg', 'zuckerberg',
  '比尔盖茨', 'bill gates', 'gates',
  '贝佐斯', 'jeff bezos', 'bezos',
  '黄仁勋', 'jensen huang',
  '雷军', '罗永浩', '周鸿祎', '马云', '马化腾',
  '李彦宏', '任正非', '王兴', '张一鸣', '刘强东',
  '巴菲特', 'warren buffett', '索罗斯',
  '特朗普', 'trump', '拜登', 'biden', '奥巴马', 'obama',
  '普京', 'putin', '泽连斯基',
]

// 已知事件
const KNOWN_EVENTS = [
  '金融危机', '次贷危机', '大萧条',
  '世界杯', '奥运会', '欧冠',
  '俄乌冲突', '俄乌战争', '巴以冲突',
  '疫情', '新冠疫情', '新冠',
  '元宇宙', 'ai浪潮', 'ai革命', '工业革命',
  '股灾', '熔断', '崩盘',
  '阿拉伯之春', '颜色革命',
  '登月', '冷战',
]

// 已知物品 / 产品 / 技术
const KNOWN_ITEMS = [
  'iphone', 'ipad', 'macbook', 'airpods', 'apple watch',
  '比特币', 'bitcoin', '以太坊', 'ethereum', 'doge', '狗狗币',
  'chatgpt', 'gpt', 'claude', 'gemini',
  '特斯拉', 'tesla', 'model 3', 'model y',
  'windows', 'android', 'ios',
  '抖音', 'tiktok', '微信', 'youtube',
  '英伟达', 'nvidia', '芯片', 'gpu',
  '区块链', 'web3', 'nft',
  '核聚变', '量子计算', '脑机接口',
]

// 人物特征关键词
const HUMAN_KEYWORDS = ['谁', '人物', '创始人', 'ceo', 'ceo', '老板', '作者', '人物', '个人', '生平', '传记', '是谁']
// 事件特征关键词
const EVENT_KEYWORDS = ['事件', '现象', '危机', '革命', '运动', '战争', '冲突', '浪潮', '历史', '经过', '怎么回事', '爆发']
// 物品特征关键词
const ITEM_KEYWORDS = ['产品', '技术', '东西', '物品', '是什么', '怎么样', '好用吗', '值得买吗', '原理', '功能']

// 模糊词 - 需要澄清
const AMBIGUOUS_TERMS: Record<string, string> = {
  '苹果': '可能指苹果公司/iPhone，也可能指水果，或与乔布斯相关',
  '亚马逊': '可能指亚马逊公司，也可能指亚马逊河流',
  '阿里': '可能指阿里巴巴，也可能指阿里地区',
  'meta': '可能指 Meta 公司，也可能指元宇宙概念',
  'foxconn': '可能指富士康公司',
}

function normalize(s: string): string {
  return s.toLowerCase().trim()
}

/**
 * 分类意图 - 判断实体类型
 * @returns EntityType 或 null（模糊需要澄清）
 */
export function classifyIntent(query: string): EntityType | null {
  const q = normalize(query)
  if (!q) return null

  // 1. 精确/包含匹配已知人物
  for (const name of KNOWN_HUMANS) {
    if (q.includes(name)) return 'HUMAN'
  }
  // 2. 包含匹配已知事件
  for (const ev of KNOWN_EVENTS) {
    if (q.includes(ev)) return 'EVENT'
  }
  // 3. 包含匹配已知物品
  for (const it of KNOWN_ITEMS) {
    if (q.includes(it)) return 'ITEM'
  }

  // 4. 模糊词检测
  for (const term of Object.keys(AMBIGUOUS_TERMS)) {
    if (q.includes(normalize(term))) return null
  }

  // 5. 关键词启发式
  const humanHit = HUMAN_KEYWORDS.some((k) => q.includes(k))
  const eventHit = EVENT_KEYWORDS.some((k) => q.includes(k))
  const itemHit = ITEM_KEYWORDS.some((k) => q.includes(k))

  // 唯一命中某一类
  if (humanHit && !eventHit && !itemHit) return 'HUMAN'
  if (eventHit && !humanHit && !itemHit) return 'EVENT'
  if (itemHit && !humanHit && !eventHit) return 'ITEM'

  // 多类同时命中或都没命中 → 视为模糊
  return null
}

/**
 * 获取澄清选项
 */
export function getClarifyOptions(query: string): ClarifyOption[] {
  const q = normalize(query)

  // 针对特定模糊词给出定制化选项
  if (q.includes('苹果')) {
    return [
      {
        label: '苹果公司 / iPhone 等产品',
        entityType: 'ITEM',
        description: '指苹果公司及其硬件、软件、生态系统产品',
        searchQuery: 'Apple Inc. 苹果公司 iPhone',
      },
      {
        label: '与乔布斯相关的传奇人物',
        entityType: 'HUMAN',
        description: '指苹果创始人史蒂夫·乔布斯本人',
        searchQuery: 'Steve Jobs 史蒂夫·乔布斯',
      },
    ]
  }
  if (q.includes('亚马逊')) {
    return [
      {
        label: '亚马逊公司 / AWS',
        entityType: 'ITEM',
        description: '指亚马逊电商平台与 AWS 云服务',
        searchQuery: 'Amazon 亚马逊公司 AWS',
      },
      {
        label: '贝佐斯其人',
        entityType: 'HUMAN',
        description: '指亚马逊创始人杰夫·贝佐斯',
        searchQuery: 'Jeff Bezos 杰夫·贝佐斯',
      },
    ]
  }
  if (q.includes('阿里')) {
    return [
      {
        label: '阿里巴巴 / 淘宝天猫',
        entityType: 'ITEM',
        description: '指阿里巴巴集团及其电商、云计算产品',
        searchQuery: 'Alibaba 阿里巴巴集团',
      },
      {
        label: '马云其人',
        entityType: 'HUMAN',
        description: '指阿里巴巴创始人马云',
        searchQuery: 'Jack Ma 马云',
      },
    ]
  }
  if (q.includes('meta')) {
    return [
      {
        label: 'Meta 公司 / Facebook',
        entityType: 'ITEM',
        description: '指 Meta 公司及其社交产品矩阵',
        searchQuery: 'Meta 公司 Facebook',
      },
      {
        label: '元宇宙浪潮',
        entityType: 'EVENT',
        description: '指元宇宙这一技术与产业现象',
        searchQuery: '元宇宙 metaverse',
      },
    ]
  }
  if (q.includes('小米')) {
    return [
      {
        label: '小米公司 / 小米手机',
        entityType: 'ITEM',
        description: '指小米集团及其手机、IoT 生态产品',
        searchQuery: 'Xiaomi 小米公司 手机',
      },
      {
        label: '雷军其人',
        entityType: 'HUMAN',
        description: '指小米创始人雷军',
        searchQuery: '雷军 Lei Jun',
      },
    ]
  }
  if (q.includes('锤子')) {
    return [
      {
        label: '锤子科技 / 罗永浩',
        entityType: 'HUMAN',
        description: '指锤子科技创始人罗永浩',
        searchQuery: '罗永浩 锤子科技',
      },
      {
        label: '锤子（工具）',
        entityType: 'ITEM',
        description: '指锤子这种工具',
        searchQuery: '锤子 工具 hammer',
      },
    ]
  }

  // 默认通用三选项
  return [
    {
      label: '一位人物',
      entityType: 'HUMAN',
      description: '查询对象是某个具体的人',
    },
    {
      label: '一个事件 / 现象',
      entityType: 'EVENT',
      description: '查询对象是某次事件、运动或社会现象',
    },
    {
      label: '一款产品 / 一项技术',
      entityType: 'ITEM',
      description: '查询对象是某个产品、技术或物品',
    },
  ]
}

/**
 * 异步获取澄清选项（LLM 优先，失败回退到关键词规则）
 */
export async function getClarifyOptionsAsync(query: string): Promise<ClarifyOption[]> {
  if (hasLLM()) {
    try {
      const result = await clarifyOptionsWithLLM(query)
      if (result && result.isAmbiguous && result.options.length >= 2) {
        return result.options
      }
      if (result && !result.isAmbiguous) {
        return []
      }
    } catch (err) {
      console.warn('[intentRouter] LLM 消歧失败，回退到规则:', (err as Error).message)
    }
  }
  return getClarifyOptions(query)
}

/**
 * 异步意图分类（关键词快速路径 + LLM 兜底）
 * 1. 先用关键词规则做 0ms 快速匹配
 * 2. 未命中且有 LLM → 用 LLM 做零样本分类
 * 3. 都没有 → 返回 null（触发澄清流程）
 */
export async function classifyIntentAsync(query: string): Promise<EntityType | null> {
  // ① 关键词快速路径（0ms）
  const fastResult = classifyIntent(query)
  if (fastResult) return fastResult

  // ② LLM 兜底
  if (hasLLM()) {
    try {
      return await classifyIntentWithLLM(query)
    } catch (err) {
      console.warn('[intentRouter] LLM 分类失败，回退到澄清:', (err as Error).message)
    }
  }

  // ③ 无法判断 → 澄清
  return null
}

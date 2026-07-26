/**
 * 文档去重（PRD-01 FR-03 第1步）
 *
 * 1. URL 规范化去重（去 utm/锚点/大小写/尾斜杠）
 * 2. 标题近重复合并（轻量 Jaccard，阈值 0.8）
 *
 * 同一文档被多源命中时合并 source 列表，保留首个出现的位置（rank 最优）。
 */
import type { RawDoc, SourceName } from '../sources/types.js'

/** URL 规范化：去 utm_*、锚点、统一小写 host、去尾斜杠 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    // 去 utm 参数
    const params = new URLSearchParams(u.search)
    for (const key of [...params.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) params.delete(key)
    }
    u.search = params.toString()
    u.hash = ''
    let s = u.toString()
    if (s.endsWith('/') && s.length > u.origin.length + 1) s = s.slice(0, -1)
    return s.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

/** 轻量分词（中英文混合：英文按空格/标点，中文按字） */
function tokenize(s: string): Set<string> {
  const t = new Set<string>()
  const lower = s.toLowerCase()
  // 英文词
  for (const w of lower.match(/[a-z0-9]+/g) ?? []) {
    if (w.length > 1) t.add(w)
  }
  // 中文字（单字）
  for (const ch of lower.match(/[\u4e00-\u9fa5]/g) ?? []) {
    t.add(ch)
  }
  return t
}

/** Jaccard 相似度 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

const TITLE_THRESHOLD = 0.8

export interface DedupeResult {
  docs: RawDoc[] // 去重后的文档（保持首次出现顺序）
  /** url 规范化键 → 命中的源列表（跨源印证用） */
  sourceMap: Map<string, SourceName[]>
}

/**
 * 去重：URL 相同或标题 Jaccard ≥ 阈值视为同一文档。
 * 合并时保留 rank 最优（最靠前）的版本，累积 source 列表。
 */
export function dedupe(docs: RawDoc[]): DedupeResult {
  const result: RawDoc[] = []
  const sourceMap = new Map<string, SourceName[]>()
  const urlIndex = new Map<string, number>() // normalizedUrl → result 下标
  const titleTokens: Set<string>[] = [] // 与 result 平行

  for (const doc of docs) {
    const nurl = normalizeUrl(doc.url)
    const tokens = tokenize(doc.title)

    // 1. URL 精确匹配
    let idx = urlIndex.get(nurl)
    let merged = false

    if (idx !== undefined) {
      // URL 命中：合并源，保留原 doc（rank 更优）
      const sources = sourceMap.get(nurl) ?? []
      if (!sources.includes(doc.source)) sources.push(doc.source)
      sourceMap.set(nurl, sources)
      merged = true
    } else {
      // 2. 标题近重复
      for (let i = 0; i < result.length; i++) {
        if (jaccard(tokens, titleTokens[i]) >= TITLE_THRESHOLD) {
          idx = i
          const existingNurl = normalizeUrl(result[i].url)
          const sources = sourceMap.get(existingNurl) ?? []
          if (!sources.includes(doc.source)) sources.push(doc.source)
          sourceMap.set(existingNurl, sources)
          merged = true
          break
        }
      }
    }

    if (!merged) {
      result.push(doc)
      titleTokens.push(tokens)
      urlIndex.set(nurl, result.length - 1)
      sourceMap.set(nurl, [doc.source])
    }
  }

  return { docs: result, sourceMap }
}

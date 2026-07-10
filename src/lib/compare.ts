/**
 * C1 双实体对比模式 — 关键词检测
 *
 * 识别 "A vs B"、"A 对比 B"、"A 和 B"、"A 与 B"、"A 以及 B" 格式。
 * 规则：分隔词两侧必须有空格，且前后各有至少 2 个字符，避免误判
 * （如 "和平" 不会被识别为 "和" 分隔）。
 */
export interface CompareInput {
  isCompare: boolean;
  queryA: string;
  queryB: string;
}

/**
 * 分隔词匹配模式（按优先级排序）。
 * 每条均要求分隔词前后有空白字符，确保其作为独立词出现。
 */
const SEPARATOR_PATTERNS: RegExp[] = [
  /\s+(?:vs|VS|Vs|vS)\s+/,
  /\s+对比\s+/,
  /\s+以及\s+/,
  /\s+和\s+/,
  /\s+与\s+/,
];

export function detectCompare(query: string): CompareInput {
  const trimmed = query.trim();
  if (!trimmed) return { isCompare: false, queryA: '', queryB: '' };

  for (const pattern of SEPARATOR_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match.index !== undefined) {
      const sepStart = match.index;
      const sepEnd = sepStart + match[0].length;
      const queryA = trimmed.slice(0, sepStart).trim();
      const queryB = trimmed.slice(sepEnd).trim();
      // 前后都必须有至少 2 个字符
      if (queryA.length >= 2 && queryB.length >= 2) {
        return { isCompare: true, queryA, queryB };
      }
    }
  }

  return { isCompare: false, queryA: '', queryB: '' };
}

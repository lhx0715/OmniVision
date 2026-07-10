// 临时测试脚本：验证 DeepSeek API 和 Tavily 搜索
import dotenv from 'dotenv'
dotenv.config()

const LLM_API_KEY = process.env.LLM_API_KEY ?? ''
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? ''
const LLM_MODEL = process.env.LLM_MODEL ?? ''
const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? ''

console.log('=== 环境变量检查 ===')
console.log('LLM_API_KEY:', LLM_API_KEY ? `已配置 (${LLM_API_KEY.slice(0, 8)}...)` : '未配置')
console.log('LLM_BASE_URL:', LLM_BASE_URL)
console.log('LLM_MODEL:', LLM_MODEL)
console.log('TAVILY_API_KEY:', TAVILY_API_KEY ? `已配置 (${TAVILY_API_KEY.slice(0, 12)}...)` : '未配置')
console.log('')

// 测试 DeepSeek API
console.log('=== 测试 DeepSeek API ===')
try {
  const url = `${LLM_BASE_URL}/chat/completions`
  console.log('请求 URL:', url)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: '只输出JSON' },
        { role: 'user', content: '返回 {"status": "ok", "message": "测试成功"}' },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 100,
    }),
  })
  console.log('HTTP Status:', res.status)
  const data = await res.json()
  if (data.error) {
    console.log('API Error:', data.error.message)
  } else {
    console.log('Response:', data.choices?.[0]?.message?.content)
  }
} catch (e) {
  console.log('Fetch Error:', e.message)
}
console.log('')

// 测试 Tavily API
console.log('=== 测试 Tavily API ===')
try {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: '马斯克',
      max_results: 3,
      include_answer: true,
    }),
  })
  console.log('HTTP Status:', res.status)
  const data = await res.json()
  if (data.answer) console.log('AI Answer:', data.answer.slice(0, 100))
  console.log('Results count:', data.results?.length ?? 0)
  if (data.results?.[0]) {
    console.log('First result:', data.results[0].title)
  }
} catch (e) {
  console.log('Fetch Error:', e.message)
}

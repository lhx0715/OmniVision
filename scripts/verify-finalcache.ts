/**
 * 验证 finalCardCache 模型与表是否就绪（不消耗 LLM/搜索 API 配额）。
 * 用法：npx tsx scripts/verify-finalcache.ts
 */
import { prisma } from '../src/server/db.js'

try {
  const count = await prisma.finalCardCache.count()
  console.log('✓ finalCardCache 模型可用，final_card_cache 表就绪，当前缓存记录数:', count)
  console.log('  → 后端已加载新 Prisma Client（prisma generate 生效）')
  process.exit(0)
} catch (err) {
  console.error('✗ finalCardCache 不可用:', (err as Error).message)
  console.error('  请依次执行：npx prisma generate && node scripts/init-db.js')
  process.exit(1)
}

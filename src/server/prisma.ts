import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;

// 自建 pg.Pool 而非让适配器内部默认创建：
// (1) 调优 keepAlive / idleTimeout 应对 Supabase 主动断连（远端 ~30s 空闲回收）
// (2) 挂载 'error' 监听器：idle 连接被服务端终止时 pg-pool 会 emit 'error'，
//     若无监听器会冒泡为 uncaughtException，导致整个 Node 进程崩溃，
//     表现为浏览器侧 /api/auth/me 出现 ERR_ABORTED（后端已死，代理 ECONNREFUSED）。
const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 20000,             // 略小于 Supabase 空闲回收阈值
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  // 仅记录日志，不抛出；池会自动回收失效连接并在下次查询时建新连接
  console.error('[pg-pool] idle client error (suppressed, will recycle):', err.message);
});

const adapter = new PrismaPg(pool, {
  onPoolError: (err) => {
    console.error('[prisma-pg] pool error:', err.message);
  },
});

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export function uuid(): string {
  return crypto.randomUUID();
}

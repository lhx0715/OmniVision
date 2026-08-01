/**
 * local server entry file, for local development
 * Vercel 环境下不启动监听，仅导出 app
 */
import app from './app.js';

const PORT = process.env.PORT || 3001;

// 全局兜底：避免单次 Prisma/pg 查询的拒绝冒泡为进程崩溃。
// pg-pool 的 'error' 监听器已在 prisma.ts 中挂载，此处为二级保险，
// 覆盖其他路由中未 try/catch 的 async 拒绝（Express 4 不自动捕获）。
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err.message);
  // 不立即退出：让 nodemon 在文件变更时优雅重启；
  // 对于瞬态连接错误，下一次请求会重新从 pool 拿连接。
});

if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`Server ready on port ${PORT}`);
  });

  // 处理端口占用等监听错误，避免无声崩溃
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] 端口 ${PORT} 已被占用，可能已有另一个后端实例在运行。请先停止旧进程（如关闭其他 npm run dev）再重启。`);
    } else {
      console.error('[server] 监听错误:', err.message);
    }
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

export default app;
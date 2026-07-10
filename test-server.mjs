// 临时测试脚本 — 验证本地 /api/search 端点 LIVE 模式
// 使用 http 模块而非 fetch（Node.js fetch/undici 在 SSE 流式响应上有兼容性问题）
import http from 'node:http'

const query = process.argv[2] || '马斯克';
const entityType = process.argv[3] || 'HUMAN';

const body = JSON.stringify({ query, entityType });

console.log(`[test] POST /api/search  query="${query}"  type=${entityType}\n`);

const req = http.request(
  {
    hostname: 'localhost',
    port: 3001,
    path: '/api/search',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    console.log(`[test] HTTP ${res.statusCode}  content-type=${res.headers['content-type']}\n`);

    if (res.statusCode !== 200 || !res.headers['content-type']?.includes('text/event-stream')) {
      console.log('[test] 非 SSE 响应');
      res.resume();
      process.exit(1);
      return;
    }

    let buffer = '';
    let eventCount = 0;

    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      // SSE 事件以 \n\n 分隔
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        // 提取 data: 行
        const lines = rawEvent.split('\n');
        let dataStr = '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            dataStr += trimmed.slice(5).trim();
          } else if (trimmed.startsWith(':')) {
            // 心跳注释行，忽略
            continue;
          }
        }
        if (!dataStr) continue;

        eventCount++;
        try {
          const obj = JSON.parse(dataStr);
          if (obj.engine) console.log(`[event ${eventCount}] engine = ${obj.engine}`);
          else if (obj.needsClarify) console.log(`[event ${eventCount}] needsClarify, options=${obj.options?.length}`);
          else if (obj.cardType) console.log(`[event ${eventCount}] card = ${obj.cardType}  keys=${Object.keys(obj.payload || {}).join(',')}`);
          else if (obj.done) console.log(`[event ${eventCount}] done = true  type=${obj.entityType}`);
          else if (obj.error) console.log(`[event ${eventCount}] error = ${obj.error}`);
          else console.log(`[event ${eventCount}] keys=${Object.keys(obj).join(',')}`);
        } catch {
          console.log(`[event ${eventCount}] (raw) ${dataStr.slice(0, 120)}`);
        }
      }
    });

    res.on('end', () => {
      console.log(`\n[test] 流结束，共 ${eventCount} 个事件`);
    });

    res.on('error', (err) => {
      console.error(`[test] 流错误: ${err.message}`);
    });
  },
);

req.on('error', (err) => {
  console.error(`[test] 请求错误: ${err.message}`);
  process.exit(1);
});

req.write(body);
req.end();

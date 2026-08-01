# SearXNG 自建搜索源部署指南

SearXNG 是开源自托管元搜索引擎，聚合 Google / Bing / DuckDuckGo / Wikipedia 等 70+ 搜索引擎结果，**完全免费、无调用上限**。作为全知视界大会场景的**主力搜索源**，可扛住任意规模的用户涌入，零 API 成本。

---

## 一、快速启动（3 分钟）

### 前置要求
- 已安装 Docker 和 Docker Compose

### 启动步骤

```bash
cd docker/searxng
docker compose up -d
```

等待约 30 秒后验证服务是否就绪：

```bash
# 健康检查
curl http://localhost:8080/healthz

# 搜索功能验证（必须返回 JSON，而不是 HTML 报错）
curl "http://localhost:8080/search?q=苹果公司&format=json" | head -c 300
```

若返回类似 `{"results":[...],"number_of_results":...}` 的 JSON，说明部署成功。

### 接入项目

在项目根目录的 `.env` 文件中配置：

```bash
SEARXNG_URL=http://localhost:8080
```

重启后端后，SearXNG 将自动作为主力源参与六维并行搜索（无需 API key）。

---

## 二、配置说明

### settings.yml 关键项

| 配置 | 值 | 作用 |
|---|---|---|
| `search.formats` | `[html, json]` | **必须**开启 json，否则适配器收到 403 |
| `server.limiter` | `false` | 关闭限流，允许程序化高频调用 |
| `server.public_instance` | `false` | 标记私有实例，不暴露 /stats |
| `search.default_lang` | `zh-CN` | 中文优先 |
| `outgoing.request_timeout` | `8` | 上游引擎超时（秒） |

`use_default_settings: true` 继承镜像自带的全套引擎配置，`engines:` 段仅做微调（确保 Google/Bing/DuckDuckGo/Wikipedia/Brave 启用）。

### 端口与资源

- 默认端口 `8080`，若冲突请改 `docker-compose.yml` 的 `ports`
- 内存上限 `1g`、CPU `2.0`，可按服务器配置调整 `mem_limit` / `cpus`
- uWSGI 4 workers × 4 threads，可应对大会并发

---

## 三、大会场景最佳实践

全知视界应对大会流量的**三重护城河**：

```
用户搜索
   │
   ▼
① FinalCardCache（24h TTL）─ 缓存命中 → 0 次 API 调用、0 次 LLM 调用
   │ 未命中
   ▼
② 多源并行召回 ── SearXNG（无限）+ Serper（2500/月）+ Tavily（1000/月）+ ...
   │ 某源被限流
   ▼
③ quotaGuard 熔断 ── 自动跳过被限流源，流量落到免费源（SearXNG / DuckDuckGo）
```

### 大会前必做：缓存预热

```bash
# 预热大会可能被搜索的热词（缓存命中后零成本）
node scripts/prewarm-cache.js

# 验证缓存状态
npx tsx scripts/verify-finalcache.ts
```

建议提前准备 50-100 个热词清单（人物/产品/事件/概念），跑一遍预热。缓存命中时完全不调用任何搜索 API。

### 大会期间监控

quotaGuard 暴露了健康状态查询，可在后端日志或自定义监控端点查看：

```typescript
import { getHealthStatus } from './services/quotaGuard.js'
console.log(getHealthStatus())
// 输出示例：
// {
//   tavily: { available: false, consecutiveTrips: 3, totalTrips: 5, openUntil: "...", ... },
//   searxng: { available: true, consecutiveTrips: 0, totalTrips: 0, totalSuccess: 842, ... },
//   ...
// }
```

某源 `available: false` 表示已熔断（冷却中），流量已自动落到其他源。

---

## 四、故障排查

### 问题：`/search?format=json` 返回 403 或 HTML

**原因**：settings.yml 未开启 JSON 格式，或 limiter 拦截了程序化请求。

**解决**：确认 `settings.yml` 中：
```yaml
search:
  formats:
    - html
    - json
server:
  limiter: false
  public_instance: false
```
然后 `docker compose restart searxng`。

### 问题：搜索结果为空或很少

**原因**：上游引擎被限流（Google/Bing 对自建实例有频率限制）。

**解决**：
1. SearXNG 会自动重试其他引擎，无需干预
2. 若整体召回低，可在 `settings.yml` 启用更多引擎（如 `startpage`、`mojeek`）
3. 大会高并发可部署多实例 + Nginx 轮询（见下文）

### 问题：响应慢（>5s）

**原因**：`outgoing.request_timeout` 过长或引擎响应慢。

**解决**：在 `settings.yml` 调小 `request_timeout`（如 `5`），SearXNG 会快速返回已收集到的结果。

### 问题：Docker 容器无法启动

```bash
# 查看日志
docker compose logs searxng

# 端口占用检查
netstat -ano | findstr :8080
```

---

## 五、生产级高可用（可选）

大会超高并发场景，可部署多个 SearXNG 实例 + Nginx 负载均衡：

```nginx
upstream searxng_pool {
    server 127.0.0.1:8081;
    server 127.0.0.1:8082;
    server 127.0.0.1:8083;
}
server {
    listen 8080;
    location / {
        proxy_pass http://searxng_pool;
        proxy_set_header Host $host;
    }
}
```

此时 `.env` 中 `SEARXNG_URL=http://localhost:8080` 指向 Nginx。

> 一般情况下单实例（4 workers）足以应对数千 QPS 的搜索请求，配合 FinalCardCache 预热，大会场景无需过度设计。

---

## 六、与其他搜索源的协同

全知视界支持多源并行，按免费额度从多到少自动优先：

| 源 | 免费额度 | 角色 | 配置 |
|---|---|---|---|
| **SearXNG** | ∞ 无限 | 主力 | `SEARXNG_URL` |
| DuckDuckGo | ∞ 免费（有速率限制） | 兜底 | 无需配置 |
| Serper | 2500 次/月 | 次主力（Google 结果） | `SERPER_API_KEY` |
| Tavily | 1000 次/月 | 图片源（影像档案 Gallery） | `TAVILY_API_KEY` |
| Exa | 1000 次/月 | 语义增强（verdict/timeline 维度） | `EXA_API_KEY` |

**配额熔断**：当 Serper/Tavily/Exa 被 429/432 限流时，quotaGuard 自动熔断 60s（指数退避至 5min），期间流量全部由 SearXNG + DuckDuckGo 承接，保证召回不归零、成本不失控。

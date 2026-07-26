# 全知视野 · 产品需求文档（PRD）+ 可执行技术方案

> 版本：v1.0　｜　日期：2026-07-26　｜　状态：待评审
> 范围：本 PRD 覆盖两个核心迭代
> - **PRD-01｜信息看板：多信源深度聚合引擎**（信源要"全、准、深"，且强于通用大模型的联网搜索）
> - **PRD-02｜追问式探索图谱 + 图谱知识库沉淀**（可追问、动态生长、可回溯、可存档调用）

---

## 0. 现状基线（Code Baseline）

在提需求前，先锚定当前代码实现，避免方案脱离现实。

| 模块 | 现状文件 | 现状能力 | 局限 |
|---|---|---|---|
| 信源检索 | `api/services/researchAgent.ts` | ReAct 循环（DeepSeek + **单一 Tavily**，≤5 步），产出 6 张卡片；已有 `crossValidate` 跨源印证雏形 | 只有 Tavily 一个信源；单轮 `max_results=6`；无信源分层加权、无多路融合排序；无学术/社交/代码等垂直源 |
| 意图路由 | `api/services/intentRouter.ts` + `riskGuard` | 关键词 + LLM 分类；三级风控（A拦截/B白名单/C排除） | 与信源解耦，尚未按实体类型路由到最优信源组合 |
| 收藏图谱 | `api/routes/graph.ts` + `api/services/graphExtractor.ts` + `src/pages/Graph.tsx` | 从**已收藏卡片**被动抽取实体/关系（reactflow 渲染，聚焦/BFS/深度筛选） | 图谱是收藏的副产品，**无法主动追问、无法动态生长、无法回溯** |
| 卡片追问 | `api/routes/ask.ts` | 基于单卡片上下文的 LLM 追问（SSE，纯文本），**不联网、不进图谱** | 追问结果一次性消失，不沉淀 |
| 数据层 | `api/db.ts`（better-sqlite3） | `users` / `knowledge_items` / `entities` / `relations` | 缺"探索会话/图谱文件夹"相关表 |

技术栈：React 18 + Vite + reactflow + zustand｜Express + better-sqlite3｜SSE 流式｜LLM=DeepSeek，检索=Tavily。

---

# PRD-01｜信息看板：多信源深度聚合引擎

## 1.1 背景与问题

用户核心诉求（摘自《产品目前存在的问题.txt》）：
> "网络的搜索来源是什么……怎么做到更加深入层次的搜索。我这款产品的搜索精确度和整合总结能力要提升，对比 GPT、Gemini 的 web search 能力，优势如何体现？""信息源头要全，目的是全面深入的，比普通通用模型要多要深入。""数据来源扩展，能不能涉及短视频、个人博客等领域。"

**一句话问题**：当前只有 Tavily 单源单轮检索，覆盖面窄、深度浅、无差异化壁垒，无法回答"凭什么比 GPT/Gemini 强"。

## 1.2 竞品能力对标（这是差异化的锚点）

通用大模型的联网搜索本质是"**传统搜索引擎的浅层单轮包装**"：

| 维度 | ChatGPT / Gemini / 豆包（内置联网） | 全知视野目标 |
|---|---|---|
| 检索层 | 套 Bing/Google，剥离为纯文本 chunk | 多信源并行 + 垂直源 |
| 单次引用源 | 通常 **3~6 条**引用 | 单实体聚合 **30~80+ 源**去重后 |
| 检索轮次 | 多为**单轮/浅多轮**"找了就答" | 六维并行规划 + ReAct 多轮 |
| 排序融合 | 引擎默认排序 | **RRF 多路融合 + 信源权威加权 + 跨源印证** |
| 结构化 | 自由文本 | 强制六维情报卡片（定性/时序/成就/趋势/争议/博弈） |
| 垂直覆盖 | 弱（学术/代码/社媒常缺失） | 学术 + 代码(GitHub) + 新闻 + 社媒/短视频（渐进接入） |
| 溯源 | 引用可点 | 每条事实带来源 + 置信度分级 + 印证源数 |

> 关键洞察：**"深度研究（Deep Research）"级别的多步检索**，在 BrowseComp 类多跳基准上准确率从通用模型的 <10% 提升到 50%+，代价是延迟与成本。我们不做全量 Deep Research（80~160 次搜索、分钟级、$2~5/次），而是做**"介于快搜与深研之间的 Deep Search"**——用工程化的多源融合把"覆盖广度 + 交叉验证 + 结构化"做到位，在 5~15 秒内给出比通用大模型更全更可信的结果。这是初创产品可落地、且有壁垒的甜点区。

（对标结论有据可查，见文末参考来源。）

## 1.3 目标与非目标

**目标（本期）**
1. 从"单 Tavily"升级为"**可插拔多信源适配器 + 多路召回融合**"。
2. 引入**六维并行查询规划**：把单一 query 分解为多维度、多语言子查询并行 fan-out。
3. 引入**信源可信度加权 + RRF 融合排序 + 跨源印证置信度分级**（技术壁垒核心）。
4. 至少接入：通用检索（Tavily）+ 语义/研究检索（Exa）+ 代码/产品热度（GitHub API）三类；预留新闻/社媒适配位。
5. 前端信息看板可展示"信源构成 / 印证强度 / 时间新鲜度"，让用户**感知到"比通用模型更深"**。

**非目标（本期不做）**
- 不做全自动 Deep Research（分钟级、上百次搜索）。
- 不做自建爬虫全网索引。
- 短视频/社媒仅预留适配器接口，本期可用第三方聚合兜底，不强制自研。

## 1.4 用户故事

- US-1：作为**股民**，我搜"英伟达"，希望不仅有公司定性，还要有近 3 年营收/交付趋势、GitHub 生态热度、机构分歧与做空争议，且每条结论能看到"几个来源印证过"。
- US-2：作为**学生**，我搜"核聚变"，希望能拿到学术进展（不是营销软文），并区分"权威源"与"自媒体推测"。
- US-3：作为**信息焦虑的普通用户**，我希望一眼看出"这份情报比我自己去问 GPT 更全"——看到信源数量、覆盖维度、时间跨度。

## 1.5 功能规格

### FR-01 信源适配器层（SourceAdapter）
统一抽象接口，屏蔽各信源差异：

```ts
// api/services/sources/types.ts
export interface RawDoc {
  title: string
  url: string
  content: string           // 正文/摘要
  publishedAt?: string      // 发布时间（用于新鲜度）
  source: SourceName        // 'tavily' | 'exa' | 'github' | 'news' | ...
  rank: number              // 该源内部返回名次（0-based，用于 RRF）
  score?: number            // 该源自带相关性分（可选）
  lang?: 'zh' | 'en' | string
  meta?: Record<string, unknown> // 如 GitHub stars/growth
}

export interface SourceAdapter {
  name: SourceName
  /** 是否适用于该实体类型/维度（路由用） */
  supports(entityType: EntityType, dimension: Dimension): boolean
  search(query: string, opts: SearchOpts): Promise<RawDoc[]>
}
```

本期实现的适配器：
| 适配器 | 库/API | 主打场景 | 备注 |
|---|---|---|---|
| `TavilyAdapter` | Tavily（现有） | 通用 + 新闻 + 正文抽取 | 保留现有 advanced 深度 |
| `ExaAdapter` | Exa `/search`（neural） | 语义/研究/话题簇发现 | 学生/科普/事件脉络强 |
| `GitHubAdapter` | GitHub REST `search/repositories` | 产品/技术热度、Star 增长 | 直接回应"同类产品增长率" |
| `NewsAdapter`（预留） | 可选（GDELT/NewsAPI） | 时效性事件 | 本期可 no-op 兜底 |
| `SocialAdapter`（预留） | 第三方聚合 | 短视频/博客/社媒 | 本期占位接口 |

> 无对应 API key 的适配器**自动降级跳过**，不影响主流程（与现有 `hasLLM()` 降级一致）。

### FR-02 六维并行查询规划（Query Planner）
把单实体查询扩展为"维度 × 语言"的子查询矩阵，并行 fan-out：

```
输入: "英伟达" (ITEM)
规划:
  verdict   → ["英伟达 是什么 公司定性", "Nvidia company overview"]
  timeline  → ["英伟达 发展历程 关键节点", "Nvidia history milestones"]
  achievements → ["英伟达 营收 市值 出货量 数据", "Nvidia revenue market cap financials"]
  trends    → ["英伟达 近三年 增长 趋势", "Nvidia GPU shipment growth 2023 2024 2025"]
  darkside  → ["英伟达 争议 反垄断 做空", "Nvidia controversy antitrust risk"]
  gameplay  → ["英伟达 竞争对手 供应链 博弈", "Nvidia competitors supply chain stakeholders"]
```

- 每个子查询路由到 `supports()` 命中的适配器集合并发执行。
- LLM（DeepSeek）负责生成子查询词（复用现有 `callLLM` + `extractJSON`），失败降级为模板拼接。

### FR-03 多路融合与信源加权（壁垒核心算法）
召回后做四步：

1. **归一化 + 去重**
   - URL 规范化去重（去 utm、锚点、大小写）。
   - 语义近重复：标题/正文前 N 字做 MinHash/SimHash 或简易 Jaccard，阈值合并（先用轻量实现，后期可升级向量）。

2. **RRF 融合排序（Reciprocal Rank Fusion）**
   多个信源各自返回有序列表，用 RRF 合并：
   ```
   RRF(doc) = Σ_over_sources  weight_source / (k + rank_source(doc))     // k=60 经验值
   ```
   同一文档被多个源命中 → 得分叠加，天然偏向"跨源共识"。

3. **信源权威加权（`weight_source` + 域名权威表）**
   - 信源级权重：学术/官方 > 主流媒体 > 通用检索 > 社媒/自媒体。
   - 域名权威表 `domainAuthority.ts`（可维护）：`.gov/.edu/官媒/权威财经` 高权重；内容农场低权重。
   - 与现有 `riskGuard` 的 B 类白名单/C 类黑名单叠加（政治敏感强制权威白名单）。

4. **跨源印证 + 置信度分级**（升级现有 `crossValidate`）
   - 同一"事实"被 ≥2 个**不同信源**命中 → `confidence: high`；单源 → `medium/low`。
   - 新鲜度衰减：`publishedAt` 越近权重越高（回应"时间轴延伸短/时效性"问题）。
   - 每条进入卡片的事实携带 `{ confidence, sourceCount, freshness }`。

### FR-04 结构化产出（沿用六维卡片，增强元信息）
最终仍产出 6 张情报卡片，但：
- 卡片级/事实级增加 `evidence` 元信息（印证源数、置信度、最新时间）。
- 新增 SSE 事件 `source_stats`：`{ totalSources, bySource: {...}, timeSpan, coveredDimensions }`，供前端"信源构成条"展示。

### FR-05 前端"深度感知"展示（信息看板）
在 `src/pages/Home.tsx` + `SourcesPanel.tsx`：
- 顶部/侧栏新增 **信源构成条**：`Tavily 24 · Exa 18 · GitHub 6 · 去重后 41 源 · 覆盖 6/6 维 · 时间跨度 2019–2026`。
- 事实/卡片上的 **置信度徽标**（高=多源印证 / 单源提示）。
- 一句对比文案（可配置）：`本报告聚合 41 源、6 维度交叉验证——通用模型通常仅引用 3~6 源。`

## 1.6 技术方案（改动清单）

```
新增:
  api/services/sources/
    types.ts            # SourceAdapter / RawDoc / Dimension 定义
    tavilyAdapter.ts    # 迁移现有 tavilySearch → 适配器
    exaAdapter.ts       # Exa neural search
    githubAdapter.ts    # GitHub repo 热度/增长
    registry.ts         # 适配器注册 + key 探测 + 降级
  api/services/fusion/
    dedupe.ts           # URL 规范化 + SimHash 近重复
    rrf.ts              # Reciprocal Rank Fusion
    domainAuthority.ts  # 域名权威表 + 信源权重
    confidence.ts       # 跨源印证 + 新鲜度 → 置信度
  api/services/queryPlanner.ts  # 六维×多语言子查询规划

改造:
  api/services/researchAgent.ts # 用 Planner+Adapters+Fusion 替换单一 tavilySearch；
                                # ReAct 循环保留，Action 从"单次搜索"→"一轮多路并行召回"
  api/routes/search.ts          # 透传 source_stats SSE 事件
  src/pages/Home.tsx / SourcesPanel.tsx / StreamingIndicator.tsx # 信源构成条 + 置信度徽标
  shared/types.ts               # 增加 EvidenceMeta / SourceStats 类型
  .env.example                  # 增加 EXA_API_KEY / GITHUB_TOKEN（可选）
```

**ReAct 循环如何与多源融合结合**（关键）：
- 保留现有 `runResearchAgent` 的 Thought→Action→Observation。
- 把 Action 的"发一次 Tavily"升级为"**发一轮六维并行多源召回 → 融合 → 观察缺口**"。
- Observation 评估仍决定是否补一轮（针对缺口维度做定向补搜）。
- 这样"广度（多源并行）"与"深度（多轮补缺）"叠加 = 差异化。

## 1.7 里程碑（建议 3 迭代）
- **M1（信源骨架）**：SourceAdapter 抽象 + Tavily 迁移 + Exa 接入 + 去重 + RRF（无 UI 变化，后端更全）。
- **M2（壁垒算法）**：域名权威加权 + 跨源印证置信度 + 六维并行规划 + GitHub 适配器。
- **M3（深度感知 UI）**：信源构成条 + 置信度徽标 + 对比文案 + source_stats 打通。

## 1.8 验收标准
- 单实体检索去重后信源数 **≥ 3× 现状**（目标 30+）。
- 关键事实中 `confidence: high`（≥2 源印证）占比 **≥ 40%**。
- 时间跨度覆盖较现状显著变长（回应"时间轴延伸短"）。
- 任一适配器/key 缺失时系统仍正常产出（降级不崩）。
- 前端能显式呈现"信源数 / 维度 / 时间跨度 / 置信度"。

## 1.9 成本与风险
- **成本**：Exa ~$7/千次、Tavily ~$7.5~8/千次、GitHub 免费额度充足。六维并行会放大调用量→用**缓存（同 query 短期缓存）+ 适配器并发上限 + 维度裁剪**控成本。
- **风险**：多步检索可能放大幻觉/伪造 URL → 用"**只保留有真实 URL 命中的事实 + 跨源印证优先**"抑制（现有代码已有此倾向，强化之）。
- **合规**：所有召回仍过 `riskGuard`（A 拦截 / B 白名单 / C 黑名单），政治敏感强制权威源。

---

# PRD-02｜追问式探索图谱 + 图谱知识库沉淀

## 2.1 背景与问题

用户诉求（原话整理）：
> "知识图谱可以进一步追问，从而调整图谱结构，有回溯功能，提问结束后有全局观看功能。""知识图谱最大的卖点就是关联。""图是可以提供记忆的。"

**决策已明确（来自你的确认）**：
1. 做一个**独立的探索页面**，但**可从收藏图谱挑一个节点作为起点导入**。
2. 用户按自己关心的方向**追问**，图谱**逐步扩展、改变形态**（每次追问联网搜索取回新实体/关系并入图）。
3. 探索满意后，整张图谱可**沉淀存档**到"**图谱知识库**"——像**文件夹**一样保存，日后可**观察与调用**，不再一问完就消失。
4. **收藏图谱与探索图谱互不影响**：收藏图谱只反映"用户搜索/收藏过的内容"的全局大盘；探索图谱是"某一确定方向"的追问沉淀。

## 2.2 目标与非目标

**目标**
1. 新增 `/explore` 探索页：以单一实体为种子，支持"选中节点 → 追问 → 联网搜索 → 增量并入图"。
2. 图谱**动态生长**：结构随追问方向改变（新增节点/边、聚焦迁移）。
3. **回溯**：记录每一步追问（问题/答案摘要/新增节点边/信源），可时间轴回放、可回退到任意步。
4. **全局观看**：探索结束后一眼看到"整张图现在长什么样 + 我问过的完整轨迹"。
5. **沉淀存档**：把一次探索存为"图谱知识库"里的一个条目（文件夹），可命名、可再次打开、可导出。
6. 与收藏图谱**数据隔离**（独立表），互不写入。

**非目标**
- 不改动现有收藏图谱（`entities`/`relations`/`graph.ts`/`Graph.tsx`）的数据与行为。
- 本期不做多人协作/共享编辑。

## 2.3 核心概念与数据模型

新增 4 张表（与现有 `entities/relations` **完全隔离**，前缀 `exploration_`）：

```sql
-- 探索会话 = "图谱知识库"里的一个文件夹
CREATE TABLE IF NOT EXISTS exploration_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                 -- 用户命名，如"英伟达的算力博弈"
  seed_label TEXT NOT NULL,            -- 种子实体名
  seed_entity_type TEXT,               -- HUMAN/EVENT/ITEM
  seed_from TEXT,                      -- 'graph_node'(从收藏图谱导入) | 'manual'(手动输入)
  status TEXT NOT NULL DEFAULT 'active', -- active | archived
  step_count INTEGER NOT NULL DEFAULT 0,
  node_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 探索图谱节点（会话内独立，不污染收藏图谱）
CREATE TABLE IF NOT EXISTS exploration_nodes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  entity_type TEXT,                    -- HUMAN/EVENT/ITEM/null
  created_by_step INTEGER NOT NULL,    -- 由第几步追问产生（0=种子）
  x REAL, y REAL,                      -- 布局位置持久化（可空）
  meta TEXT,                           -- JSON: 简介/信源等
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, label)            -- 会话内同名合并
);

-- 探索图谱边
CREATE TABLE IF NOT EXISTS exploration_edges (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL REFERENCES exploration_nodes(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES exploration_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  created_by_step INTEGER NOT NULL,    -- 由第几步产生（回溯用）
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, from_node_id, to_node_id, relation)
);

-- 追问轨迹（回溯 + 全局观看的核心）
CREATE TABLE IF NOT EXISTS exploration_steps (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,         -- 0,1,2... 顺序
  target_node_id TEXT,                 -- 针对哪个节点追问
  target_label TEXT,                   -- 冗余存名，便于回放展示
  question TEXT NOT NULL,              -- 用户的追问
  answer_summary TEXT,                 -- LLM 对本轮的凝练摘要
  added_node_ids TEXT,                 -- JSON 数组：本步新增节点
  added_edge_ids TEXT,                 -- JSON 数组：本步新增边
  sources TEXT,                        -- JSON：本步引用信源
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_expl_sess_user ON exploration_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_expl_node_sess ON exploration_nodes(session_id);
CREATE INDEX IF NOT EXISTS idx_expl_edge_sess ON exploration_edges(session_id);
CREATE INDEX IF NOT EXISTS idx_expl_step_sess ON exploration_steps(session_id, step_index);
```

**回溯机制**：节点/边都带 `created_by_step`。回放到第 k 步 = 只渲染 `created_by_step ≤ k` 的节点与边（纯前端过滤，零额外查询）。回退删除第 k 步 = 删除 `created_by_step = k` 的节点/边 + 该 step 记录（并重算计数）。
**全局观看** = 展示完整图（所有步）+ 右侧"追问轨迹时间线"（steps 列表，可点击跳转/高亮该步新增的子图）。

## 2.4 用户流程（关键交互）

```
入口 A：收藏图谱 Graph.tsx → 选中节点 → 新增按钮"以此为起点探索" → 携带 {label, entityType} 跳转 /explore?seed=...
入口 B：探索页直接输入一个实体，手动开一个新探索

/explore（新会话）
 1. 渲染种子节点（居中）
 2. 用户点选任一节点 → 底部"关系追问框"聚焦该节点
    输入示例："他的主要竞争对手有哪些？""这件事的后续影响？"
 3. 提交 → SSE 流式：
      - 进度：规划 → 联网搜索(多源) → 抽取实体关系 → 并入图
      - 增量推送：new_nodes / new_edges / step_summary / sources
 4. 图谱实时生长：新节点从被追问节点辐射出现，聚焦迁移到新簇
 5. 重复 2~4，图谱形态随提问方向不断改变
 6. 顶部"回溯"滑块：拖动查看图在第 k 步时的样子；可"回退此步"
 7. 满意后点"存入图谱知识库" → 命名 → status=archived
 8. 图谱知识库列表（文件夹视图）：卡片列出每个已存探索（标题/种子/节点数/步数/时间），点击可重新打开只读回看或继续追问
```

## 2.5 功能规格

### FR-06 会话管理（图谱知识库 = 文件夹）
- `GET /api/explore/sessions`：列出当前用户所有探索会话（active + archived），用于"图谱知识库"文件夹视图。
- `POST /api/explore/sessions`：创建会话。Body `{ title?, seedLabel, seedEntityType?, seedFrom }`。自动建种子节点（step 0）。
- `GET /api/explore/sessions/:id`：返回该会话完整图（nodes+edges）+ steps 轨迹。
- `PATCH /api/explore/sessions/:id`：改名 / `archive`（沉淀存档）/ 重新 `active`。
- `DELETE /api/explore/sessions/:id`：删除整个文件夹（级联删节点/边/步）。

### FR-07 关系追问（联网 → 生长）— 核心端点
`POST /api/explore/sessions/:id/ask`（**SSE**）
Body：`{ targetNodeId, question }`

后端流程（复用 PRD-01 的多源检索能力）：
1. 取 targetNode 上下文（label/type/已有邻居）+ question。
2. **联网检索**（多源融合，可复用 `researchAgent` 的召回融合层，聚焦"关系发现"）。
3. **LLM 关系抽取**（升级 `graphExtractor` 的 `RELATION_EXTRACT_PROMPT`）：从检索结果中抽取 `{from, to, relation, fromType, toType}` 三元组，且 `from` 通常锚定 targetNode。
4. **并入会话图**：`getOrCreateExplorationEntity/Relation`（会话内同名合并，`created_by_step=当前步`）。
5. **写 step 记录**：question / answer_summary / added_node_ids / added_edge_ids / sources。
6. **SSE 增量推送**：
   ```
   data: { stage: 'planning' | 'searching' | 'extracting' | 'merging' }
   data: { newNode: {...} }        // 逐个/成批
   data: { newEdge: {...} }
   data: { stepSummary: '...', sources: [...] }
   data: { done: true, step: k, nodeCount, edgeCount }
   ```
7. 更新 session 的 `step_count/node_count/updated_at`。

> 复用性：`ask.ts` 现有的 SSE + 心跳 + 断连处理骨架可直接借用；检索融合层与 PRD-01 共用；关系抽取 prompt 从 `graphExtractor.ts` 演进。

### FR-08 回溯与全局观看（纯前端）
- **回溯滑块**：`0 ~ step_count`，值 = k → 只渲染 `created_by_step ≤ k` 的子图；播放键可"逐步重放生长动画"。
- **回退此步**：删除第 k 步（调 `DELETE /api/explore/sessions/:id/steps/:index`，级联删该步节点/边）。
- **追问轨迹时间线**（右侧栏）：steps 列表（第 k 问：对【X】问"…"→ 新增 N 节点/M 边）。点击某步 → 高亮该步新增子图。
- **全局观看模式**：一键 fitView 全图 + 展开完整轨迹，用于"探索结束后脑中形成整体概念"。

### FR-09 从收藏图谱导入起点
- 在 `Graph.tsx` 的节点聚焦卡片里，新增按钮**"以此为起点探索"** → `navigate('/explore?seedLabel=xx&seedType=xx&from=graph_node')`。
- 探索页读 query 参数自动建会话。**不回写**收藏图谱（隔离）。

## 2.6 技术方案（改动清单）

```
新增（后端）:
  api/routes/explore.ts               # 会话 CRUD + /ask(SSE) + /steps 删除，requireAuth
  api/services/exploreGraph.ts        # 会话内 getOrCreate 节点/边、写 step、增量并图
  api/services/relationDiscovery.ts   # 关系发现：多源检索 + LLM 三元组抽取（聚焦 targetNode）
  api/db.ts                           # 追加 4 张 exploration_* 表（不动现有表）

新增（前端）:
  src/pages/Explore.tsx               # 探索图谱主页（reactflow，复用 Graph.tsx 的节点/边/布局组件）
  src/pages/GraphLibrary.tsx          # "图谱知识库"文件夹列表页（或作为 Explore 的 tab）
  src/components/AskDockPanel.tsx      # 底部关系追问框（针对选中节点）
  src/components/BacktrackSlider.tsx   # 回溯滑块 + 轨迹时间线
  src/store/explore.ts                # zustand：会话状态、增量并图、回溯步数
  src/hooks/useSSE.ts                  # 复用现有 SSE hook

改造:
  src/App.tsx                         # 新增路由 /explore、/graph-library
  src/pages/Graph.tsx                 # 节点卡片加"以此为起点探索"按钮（唯一改动，隔离安全）
```

**代码复用要点**
- reactflow 的 `EntityNode` / `FloatingEdge` / 环形&辐射布局 / BFS，可从 `Graph.tsx` 抽成共享组件供两页复用。
- SSE 骨架（心跳、`res.on('close')` 断连、`safeWrite`）从 `ask.ts`/`search.ts` 复用。
- 关系抽取 prompt 从 `graphExtractor.ts` 的 `RELATION_EXTRACT_PROMPT` 演进（增加"锚定 targetNode、发现新实体"约束）。

## 2.7 里程碑（建议 3 迭代）
- **M1（骨架跑通）**：4 张表 + 会话 CRUD + `/explore` 渲染种子 + 手动输入起点 + 单步追问并入图（先接单源，能长出来）。
- **M2（生长 + 回溯）**：多源关系发现 + step 轨迹 + 回溯滑块 + 轨迹时间线 + 生长动画。
- **M3（沉淀 + 打通）**：图谱知识库文件夹视图 + 归档/改名/删除 + 从收藏图谱导入起点 + 导出。

## 2.8 验收标准
- 可从收藏图谱选节点进入探索页并生成种子。
- 对任一节点追问后，图内**确实新增有来源支撑的节点/边**，聚焦迁移正确。
- 回溯滑块能正确重放任意中间形态；回退某步能正确删除该步产物。
- 探索可存档为图谱知识库条目，重新打开与原图一致。
- 全程**不修改** `entities/relations` 任何数据（隔离校验）。

## 2.9 风险
- **图爆炸**：多轮追问节点过多 → 每步新增节点上限（如 ≤8）+ 语义去重合并 + 度数/权威裁剪。
- **关系噪声**：LLM 臆造关系 → 只保留检索证据支撑的三元组，标注来源，低置信度弱化显示。
- **性能**：单会话图渐大 → 前端按 `created_by_step` 增量渲染 + 视口裁剪；DB 已建 session 索引。

---

## 3. 两个需求的协同点
- PRD-01 的**多源检索融合层是 PRD-02 关系追问的底座**：追问的"联网搜索"直接复用同一套适配器 + 融合 + 置信度，保证"追问出来的关系"同样可信、可溯源。
- 一次实现，两处受益：信源越强，图谱生长的质量越高。

## 4. 建议实施顺序
1. **先做 PRD-01 的 M1+M2（信源骨架 + 融合算法）**——它是两个需求的公共底座，且独立可上线、立即提升现有信息看板。
2. **再做 PRD-02 的 M1→M3**——直接站在 PRD-01 的融合层之上，事半功倍。
3. PRD-01 的 M3（深度感知 UI）可与 PRD-02 并行。

---

## 参考来源（信源格局与竞品对标依据）
- [Agentic Search in 2026: Benchmark 8 Search APIs (AIMultiple)](https://aimultiple.com/agentic-search)
- [Exa vs Tavily vs Serper vs Brave for AI Agents (DEV)](https://dev.to/supertrained/exa-vs-tavily-vs-serper-vs-brave-search-for-ai-agents-an-score-comparison-2l1g)
- [The best web search APIs for AI in 2026 (Brave)](https://brave.com/learn/best-search-api-2026/)
- [Best Web Search APIs for AI Agents 2026 (Vellum)](https://www.vellum.ai/blog/best-web-search-apis-and-mcps-for-ai-agents)
- [Web Search & Deep Research for AI Agents (Firecrawl)](https://www.firecrawl.dev/blog/deep-research-for-ai-agents)
- [From Web Search towards Agentic Deep Research (arXiv 2506.18959)](https://arxiv.org/html/2506.18959)
- [Deep Research Agents: A Systematic Examination (arXiv 2506.18096)](https://arxiv.org/pdf/2506.18096)
- [How ChatGPT Search Results Work (Dejan Marketing)](https://dejanmarketing.com/gpt-search/)
- [Search vs Deep Search vs Deep Research in 2026 (Glukhov)](https://www.glukhov.org/rag/architecture/search-vs-deepsearch-vs-deep-research/)

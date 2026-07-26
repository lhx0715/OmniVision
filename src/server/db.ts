/**
 * SQLite 数据库层 — 知识库与图谱持久化地基
 *
 * 表结构：
 *   users          — 用户账号
 *   knowledge_items — 收藏的情报卡片（卡片级粒度）
 *   entities       — 知识图谱节点（实体）
 *   relations      — 知识图谱边（关系）
 *
 * 采用 better-sqlite3 同步 API，开发期零配置运行
 * 后期可平滑迁移至 Supabase/Postgres（表结构已对齐）
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 数据库文件存放于项目根目录 data/ 下
// 注意：__dirname 指向 api/，回到项目根只需一层 ../（此前误用 ../../ 会跳出
// 到 D:\Trae\data，导致 EPERM / 目录不存在）
const DB_PATH = path.resolve(__dirname, '../data/omnivision.db')

let db: Database.Database

/**
 * 获取数据库实例（单例）
 * 首次调用时初始化表结构
 */
export function getDb(): Database.Database {
  if (db) return db

  // 确保 data 目录存在（better-sqlite3 要求父目录必须存在，否则抛
  // "Cannot open database because the directory does not exist"）
  const dataDir = path.dirname(DB_PATH)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL') // 写并发优化
  db.pragma('foreign_keys = ON')

  // ===== 建表 =====
  db.exec(`
    -- 用户表
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 知识库条目 — 收藏的情报卡片（卡片级粒度）
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_query TEXT NOT NULL,          -- 来自哪次搜索（如"马斯克"）
      entity_name TEXT NOT NULL,           -- 实体名（从 query 提取）
      entity_type TEXT,                    -- HUMAN/EVENT/ITEM
      card_type TEXT NOT NULL,             -- verdict/timeline/achievements/trends/darkside/gameplay
      card_payload TEXT NOT NULL,          -- 卡片完整内容 JSON
      saved_at TEXT DEFAULT (datetime('now'))
    );

    -- 知识图谱节点 — 实体
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,                  -- 实体名称
      entity_type TEXT,                    -- HUMAN/EVENT/ITEM
      source_query TEXT,                   -- 首次出现的搜索词
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );

    -- 知识图谱边 — 关系
    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL,         -- 创立/竞争/监管/依赖/对立等
      source_card_type TEXT,               -- 来源卡片类型（gameplay/darkside/timeline）
      source_query TEXT,                   -- 来源搜索词
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, from_entity_id, to_entity_id, relation_type)
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_knowledge_user ON knowledge_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_card_type ON knowledge_items(user_id, card_type);
    CREATE INDEX IF NOT EXISTS idx_knowledge_entity ON knowledge_items(user_id, entity_name);
    CREATE INDEX IF NOT EXISTS idx_entities_user ON entities(user_id);
    CREATE INDEX IF NOT EXISTS idx_relations_user ON relations(user_id);
    CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);
    CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);

    -- ===== PRD-02：探索图谱（与 entities/relations 完全隔离，前缀 exploration_）=====

    -- 探索会话 = "图谱知识库"里的一个文件夹
    CREATE TABLE IF NOT EXISTS exploration_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      seed_label TEXT NOT NULL,
      seed_entity_type TEXT,
      seed_from TEXT,
      status TEXT NOT NULL DEFAULT 'active',
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
      entity_type TEXT,
      created_by_step INTEGER NOT NULL,
      x REAL,
      y REAL,
      meta TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, label)
    );

    -- 探索图谱边
    CREATE TABLE IF NOT EXISTS exploration_edges (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      from_node_id TEXT NOT NULL REFERENCES exploration_nodes(id) ON DELETE CASCADE,
      to_node_id TEXT NOT NULL REFERENCES exploration_nodes(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      created_by_step INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, from_node_id, to_node_id, relation)
    );

    -- 追问轨迹（回溯 + 全局观看的核心）
    CREATE TABLE IF NOT EXISTS exploration_steps (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      target_node_id TEXT,
      target_label TEXT,
      question TEXT NOT NULL,
      answer_summary TEXT,
      added_node_ids TEXT,
      added_edge_ids TEXT,
      sources TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expl_sess_user ON exploration_sessions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_expl_node_sess ON exploration_nodes(session_id);
    CREATE INDEX IF NOT EXISTS idx_expl_edge_sess ON exploration_edges(session_id);
    CREATE INDEX IF NOT EXISTS idx_expl_step_sess ON exploration_steps(session_id, step_index);

    -- ===== 搜索结果缓存（24h TTL，降低重复查询的 API 消耗）=====
    CREATE TABLE IF NOT EXISTS search_cache (
      cache_key TEXT PRIMARY KEY,           -- sha256(query + source + maxResults + domains)
      query TEXT NOT NULL,
      source TEXT NOT NULL,                 -- tavily/exa/github
      dimension TEXT,                       -- 维度（可选）
      docs_json TEXT NOT NULL,              -- RawDoc[] 序列化
      images_json TEXT,                     -- images[] 序列化（Tavily 专属）
      answer TEXT,                          -- Tavily AI 摘要
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_search_cache_key ON search_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_search_cache_created ON search_cache(created_at);
  `)

  console.log('[db] SQLite 初始化完成:', DB_PATH)
  return db
}

/**
 * 生成 UUID（无需外部依赖）
 */
export function uuid(): string {
  return crypto.randomUUID()
}

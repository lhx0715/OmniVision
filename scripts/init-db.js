import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('=== 初始化数据库表结构 ===\n');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('PostgreSQL连接成功!\n');
  } catch (error) {
    console.error('PostgreSQL连接失败:', error);
    process.exit(1);
  }

  const createTables = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      source_query VARCHAR(500) NOT NULL,
      entity_name VARCHAR(255) NOT NULL,
      entity_type VARCHAR(100),
      card_type VARCHAR(100) NOT NULL,
      card_payload TEXT NOT NULL,
      saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      name VARCHAR(255) NOT NULL,
      entity_type VARCHAR(100),
      source_query VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS relations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      from_entity_id UUID NOT NULL,
      to_entity_id UUID NOT NULL,
      relation_type VARCHAR(100) NOT NULL,
      source_card_type VARCHAR(100),
      source_query VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, from_entity_id, to_entity_id, relation_type)
    );

    CREATE TABLE IF NOT EXISTS exploration_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      title VARCHAR(255) NOT NULL,
      seed_label VARCHAR(255) NOT NULL,
      seed_entity_type VARCHAR(100),
      seed_from VARCHAR(255),
      status VARCHAR(50) DEFAULT 'active',
      step_count INTEGER DEFAULT 0,
      node_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exploration_nodes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL,
      user_id UUID NOT NULL,
      label VARCHAR(255) NOT NULL,
      entity_type VARCHAR(100),
      created_by_step INTEGER NOT NULL,
      x FLOAT,
      y FLOAT,
      meta TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, label)
    );

    CREATE TABLE IF NOT EXISTS exploration_edges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL,
      user_id UUID NOT NULL,
      from_node_id UUID NOT NULL,
      to_node_id UUID NOT NULL,
      relation VARCHAR(255) NOT NULL,
      created_by_step INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, from_node_id, to_node_id, relation)
    );

    CREATE TABLE IF NOT EXISTS exploration_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL,
      user_id UUID NOT NULL,
      step_index INTEGER NOT NULL,
      target_node_id UUID,
      target_label VARCHAR(255),
      question TEXT NOT NULL,
      answer_summary TEXT,
      added_node_ids TEXT,
      added_edge_ids TEXT,
      sources TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      cache_key VARCHAR(500) PRIMARY KEY,
      query VARCHAR(500) NOT NULL,
      source VARCHAR(100) NOT NULL,
      dimension VARCHAR(100),
      docs_json TEXT NOT NULL,
      images_json TEXT,
      answer TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 知识库文件夹分类（单层，不嵌套）
    CREATE TABLE IF NOT EXISTS knowledge_folders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      color VARCHAR(50),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );

    -- 文件夹级知识图谱快照（1:1 with folder）
    CREATE TABLE IF NOT EXISTS knowledge_graphs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      folder_id UUID UNIQUE NOT NULL REFERENCES knowledge_folders(id) ON DELETE CASCADE,
      nodes_json TEXT NOT NULL,
      edges_json TEXT NOT NULL,
      node_count INTEGER DEFAULT 0,
      edge_count INTEGER DEFAULT 0,
      source_card_ids TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- knowledge_items 新增 folder_id 列（兼容旧数据，NULL = 未分类）
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='knowledge_items' AND column_name='folder_id') THEN
        ALTER TABLE knowledge_items ADD COLUMN folder_id UUID;
      END IF;
    END$$;

    -- knowledge_items.folder_id 外键（删 folder 时卡片 folder_id 置 NULL）
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='knowledge_items_folder_id_fkey') THEN
        ALTER TABLE knowledge_items
          ADD CONSTRAINT knowledge_items_folder_id_fkey
          FOREIGN KEY (folder_id) REFERENCES knowledge_folders(id) ON DELETE SET NULL;
      END IF;
    END$$;
  `;

  try {
    await client.query(createTables);
    console.log('所有表创建成功!\n');
  } catch (error) {
    console.error('表创建失败:', error);
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log('=== 数据库初始化完成 ===');
}

main().catch((error) => {
  console.error('初始化失败:', error);
  process.exit(1);
});
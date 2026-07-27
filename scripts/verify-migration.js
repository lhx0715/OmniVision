import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('=== 验证数据迁移结果 ===\n');
  
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await pgClient.connect();
    console.log('PostgreSQL连接成功!\n');
  } catch (error) {
    console.error('PostgreSQL连接失败:', error);
    process.exit(1);
  }

  const tables = ['users', 'knowledge_items', 'entities', 'relations', 'exploration_sessions', 'exploration_nodes', 'exploration_edges', 'exploration_steps', 'search_cache'];
  
  for (const table of tables) {
    const result = await pgClient.query(`SELECT COUNT(*) as count FROM ${table}`);
    console.log(`${table}: ${result.rows[0].count} 条记录`);
  }

  await pgClient.end();
  console.log('\n=== 验证完成 ===');
}

main().catch((error) => {
  console.error('验证失败:', error);
  process.exit(1);
});
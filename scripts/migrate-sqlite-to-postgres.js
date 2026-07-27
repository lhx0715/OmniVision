import Database from 'better-sqlite3';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const sqliteDb = new Database('data/omnivision.db');

async function main() {
  console.log('=== 开始数据迁移 ===\n');
  
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

  const sqliteTables = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('SQLite中的表:', sqliteTables.map(t => t.name).join(', '), '\n');

  for (const { name: tableName } of sqliteTables) {
    console.log(`处理表: ${tableName}...`);
    
    try {
      const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all();
      
      if (rows.length === 0) {
        console.log(`  ${tableName}: 无数据，跳过\n`);
        continue;
      }
      
      console.log(`  ${tableName}: 发现 ${rows.length} 条记录`);
      
      let successCount = 0;
      let skipCount = 0;
      
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const values = Object.values(row);
        
        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
        
        try {
          await pgClient.query(sql, values);
          successCount++;
        } catch (error) {
          if (error.code === '23505') {
            skipCount++;
          } else {
            console.log(`    插入失败: ${error.message.substring(0, 100)}`);
          }
        }
      }
      
      console.log(`  ${tableName}: 成功 ${successCount} 条，跳过重复 ${skipCount} 条\n`);
    } catch (error) {
      console.log(`  ${tableName}: 读取失败或表不存在: ${error.message}\n`);
    }
  }

  await pgClient.end();
  sqliteDb.close();
  console.log('=== 数据迁移完成 ===');
}

main().catch((error) => {
  console.error('迁移失败:', error);
  process.exit(1);
});
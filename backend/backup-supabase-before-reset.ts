import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

async function run() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DIRECT_URL or DATABASE_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const tablesRes = await client.query<{
      table_name: string;
    }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const backup: Record<string, unknown[]> = {};
    for (const { table_name } of tablesRes.rows) {
      const rowsRes = await client.query(`SELECT * FROM "${table_name}"`);
      backup[table_name] = rowsRes.rows;
      console.log(`Backed up ${table_name}: ${rowsRes.rowCount} rows`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const outputPath = path.join(backupDir, `supabase-backup-${timestamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`Backup written: ${outputPath}`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Backup failed:', error);
  process.exit(1);
});

import 'dotenv/config';
import { Client } from 'pg';
import { fetchCctnsComplaints } from './src/services/cctns.js';
import {
  CctnsComplaintRow,
  normalizeComplaintRow,
  NormalizedCctnsComplaint,
} from './src/services/cctns-normalize.js';

const TIME_FROM = '01/04/2026';
const TIME_TO = '30/04/2026';
const UPSERT_CHUNK_SIZE = 500;

const DATA_COLUMNS = [
  'complRegNum', 'complRegDt', 'district', 'complDesc', 'complSrno',
  'firstName', 'lastName', 'mobile', 'gender', 'age',
  'addressLine1', 'addressLine2', 'addressLine3', 'village', 'tehsil',
  'addressDistrict', 'addressPs', 'receptionMode', 'incidentType', 'incidentPlc',
  'incidentFromDt', 'incidentToDt', 'submitPsCd', 'submitOfficeCd', 'email',
  'statusOfComplaint', 'disposalDate', 'classOfIncident', 'complaintSource', 'typeOfComplaint',
  'complainantType', 'complaintPurpose', 'ioDetails', 'respondentCategories', 'transferDistrictCd',
  'transferOfficeCd', 'transferPsCd',
] as const;

type DataColumn = (typeof DATA_COLUMNS)[number];

const toUnique = (rows: CctnsComplaintRow[]): NormalizedCctnsComplaint[] => {
  const byRegNum = new Map<string, NormalizedCctnsComplaint>();
  for (const row of rows) {
    const normalized = normalizeComplaintRow(row);
    if (!normalized) continue;
    byRegNum.set(normalized.complRegNum, normalized);
  }
  return Array.from(byRegNum.values());
};

const buildBatchUpsert = (rows: NormalizedCctnsComplaint[]) => {
  const params: unknown[] = [];
  const valueClauses = rows.map((row, rowIndex) => {
    const base = rowIndex * DATA_COLUMNS.length;
    for (const col of DATA_COLUMNS) {
      params.push((row as Record<DataColumn, unknown>)[col]);
    }
    const placeholders = DATA_COLUMNS.map((_, colIndex) => `$${base + colIndex + 1}`);
    return `(${placeholders.join(',')}, NOW(), NOW())`;
  });

  const insertColumns = DATA_COLUMNS.map((c) => `"${c}"`).join(',');
  const updateSet = DATA_COLUMNS
    .filter((c) => c !== 'complRegNum')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(',\n  ');

  const sql = `
INSERT INTO "CCTNSComplaint" (${insertColumns}, "createdAt", "updatedAt")
VALUES
${valueClauses.join(',\n')}
ON CONFLICT ("complRegNum") DO UPDATE SET
  ${updateSet},
  "updatedAt" = NOW();
`;

  return { sql, params };
};

async function run() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is required');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log(`Fetching PHQ data for ${TIME_FROM} to ${TIME_TO}...`);
    const rawRows = (await fetchCctnsComplaints(TIME_FROM, TIME_TO)) as CctnsComplaintRow[];
    console.log(`Raw rows fetched: ${rawRows.length}`);

    const uniqueRows = toUnique(rawRows);
    console.log(`Unique rows by COMPL_REG_NUM: ${uniqueRows.length}`);

    let upserted = 0;
    for (let i = 0; i < uniqueRows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = uniqueRows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { sql, params } = buildBatchUpsert(chunk);
      await client.query(sql, params);
      upserted += chunk.length;
      console.log(`Upserted: ${upserted}`);
    }

    const totalCount = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "CCTNSComplaint"`);
    const withStatus = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "CCTNSComplaint" WHERE "statusOfComplaint" IS NOT NULL`
    );
    const withDisposalDate = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "CCTNSComplaint" WHERE "disposalDate" IS NOT NULL`
    );
    const samples = await client.query(
      `SELECT "complRegNum","complRegDt","district","addressDistrict","typeOfComplaint","statusOfComplaint","disposalDate" FROM "CCTNSComplaint" ORDER BY "id" ASC LIMIT 2`
    );

    console.log('--- Backfill summary ---');
    console.log(`Upserted rows: ${upserted}`);
    console.log(`Table count: ${totalCount.rows[0]?.count}`);
    console.log(`Rows with Status_of_Complaint: ${withStatus.rows[0]?.count}`);
    console.log(`Rows with Disposal_Date: ${withDisposalDate.rows[0]?.count}`);
    console.log(`Sample rows: ${JSON.stringify(samples.rows, null, 2)}`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});

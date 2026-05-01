import 'dotenv/config';
import { prisma } from './src/config/database.js';
import { fetchCctnsComplaints } from './src/services/cctns.js';
import {
  CctnsComplaintRow,
  normalizeComplaintRow,
  NormalizedCctnsComplaint,
} from './src/services/cctns-normalize.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDateStr = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const toUnique = (rows: CctnsComplaintRow[]): NormalizedCctnsComplaint[] => {
  const byRegNum = new Map<string, NormalizedCctnsComplaint>();
  for (const row of rows) {
    const normalized = normalizeComplaintRow(row);
    if (!normalized) continue;
    byRegNum.set(normalized.complRegNum, normalized);
  }
  return Array.from(byRegNum.values());
};

async function syncChunk(startDate: Date, endDate: Date) {
  const timeFrom = formatDateStr(startDate);
  const timeTo = formatDateStr(endDate);
  console.log(`\n--- Syncing chunk: ${timeFrom} to ${timeTo} ---`);

  try {
    const rows = (await fetchCctnsComplaints(timeFrom, timeTo)) as CctnsComplaintRow[];
    const uniqueRows = toUnique(rows);

    const CHUNK_SIZE = 500;
    for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
      const chunk = uniqueRows.slice(i, i + CHUNK_SIZE);
      await prisma.cCTNSComplaint.createMany({
        data: chunk,
        skipDuplicates: true,
      });
    }

    console.log(`  Raw fetched: ${rows.length}`);
    console.log(`  Unique saved: ${uniqueRows.length}`);
  } catch (error) {
    console.error(`  Failed chunk ${timeFrom}-${timeTo}:`, error);
  }
}

async function runHistoricalSync() {
  console.log('Starting 3-month historical sync...');
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(endDate.getMonth() - 3);

  let currentStart = new Date(startDate);
  while (currentStart < endDate) {
    const currentEnd = new Date(Math.min(new Date(currentStart).setDate(currentStart.getDate() + 6), endDate.getTime()));
    await syncChunk(currentStart, currentEnd);
    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() + 1);
    await delay(2000);
  }
  console.log('\nSync complete.');
}

runHistoricalSync()
  .catch((error) => console.error(error))
  .finally(async () => {
    await prisma.$disconnect();
  });

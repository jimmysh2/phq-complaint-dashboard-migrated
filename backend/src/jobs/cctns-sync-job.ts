import { prisma } from '../config/database.js';
import { fetchCctnsComplaints } from '../services/cctns.js';
import {
  CctnsComplaintRow,
  normalizeComplaintRow,
  NormalizedCctnsComplaint,
} from '../services/cctns-normalize.js';
import { enrichWithMasterIds } from '../services/master-mapping.js';

const formatDateStr = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const processInBatches = async <T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<void>
) => {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map((item) => processor(item)));
  }
};

const toNormalizedUnique = (rows: CctnsComplaintRow[]): NormalizedCctnsComplaint[] => {
  const byRegNum = new Map<string, NormalizedCctnsComplaint>();
  for (const row of rows) {
    const normalized = normalizeComplaintRow(row);
    if (!normalized) continue;
    byRegNum.set(normalized.complRegNum, normalized);
  }
  return Array.from(byRegNum.values());
};

interface CctnsSyncResult {
  timeFrom: string;
  timeTo: string;
  complaints: {
    fetched: number;
    upserted: number;
    errors: number;
  };
}

let isSyncing = false;

// Retry a DB operation up to `attempts` times with `delayMs` gap
const withRetry = async <T>(fn: () => Promise<T>, attempts = 3, delayMs = 5000): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        console.log(`[SYNC] DB not ready, retrying in ${delayMs / 1000}s... (attempt ${i + 1}/${attempts})`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
};

export const runCctnsSync = async (): Promise<CctnsSyncResult | null> => {
  if (isSyncing) {
    console.log('[SYNC] Already syncing, skipping...');
    return null;
  }

  isSyncing = true;
  console.log('[SYNC] Starting background CCTNS data sync...');

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 2);

  const timeFrom = formatDateStr(startDate);
  const timeTo = formatDateStr(endDate);
  const result: CctnsSyncResult = {
    timeFrom,
    timeTo,
    complaints: { fetched: 0, upserted: 0, errors: 0 },
  };

  // Create sync run record — retry if DB is still waking up from idle
  let syncRun: { id: number };
  try {
    syncRun = await withRetry(() => prisma.syncRun.create({
      data: {
        kind: 'cctns-background',
        status: 'running',
        startedAt: new Date(),
      },
    }));
  } catch (err) {
    console.error('[SYNC] Could not connect to database after retries. Skipping sync.', err);
    isSyncing = false;
    return null;
  }

  try {
    const complaints = (await fetchCctnsComplaints(timeFrom, timeTo)) as CctnsComplaintRow[];
    result.complaints.fetched = complaints.length;
    const normalized = toNormalizedUnique(complaints);

    await processInBatches(normalized, 100, async (data) => {
      try {
        const mapped = await enrichWithMasterIds(data);
        await prisma.complaint.upsert({
          where: { complRegNum: data.complRegNum },
          update: mapped,
          create: mapped,
        });
        result.complaints.upserted++;
      } catch (error) {
        result.complaints.errors++;
        console.error('[SYNC] Error saving complaint:', error);
      }
    });

  } catch (error) {
    result.complaints.errors++;
    console.error(`[SYNC] Failed to sync complaints: ${error}`);
  } finally {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: result.complaints.errors > 0 ? 'partial' : 'success',
        endedAt: new Date(),
        fetchedCount: result.complaints.fetched,
        upsertedCount: result.complaints.upserted,
        errorCount: result.complaints.errors,
      },
    }).catch(() => undefined);
    isSyncing = false;
  }

  return result;
};

let intervalHandle: NodeJS.Timeout | null = null;

export const startCctnsBackgroundSync = () => {
  if (intervalHandle) return;

  // Wait 15s before first sync — gives Neon DB time to wake from idle on cold start
  console.log('[SYNC] Server ready. First sync will begin in 15 seconds...');
  setTimeout(() => {
    runCctnsSync().catch((error) => console.error('[SYNC] Initial sync failed:', error));
  }, 15_000);
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  intervalHandle = setInterval(() => {
    runCctnsSync().catch((error) => console.error('[SYNC] Scheduled sync failed:', error));
  }, FOUR_HOURS_MS);
};

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess, sendNotFound, sendError } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { getCctnsToken, fetchCctnsComplaints, clearCctnsToken } from '../services/cctns.js';
import {
  CctnsComplaintRow,
  NormalizedCctnsComplaint,
  normalizeComplaintRow,
} from '../services/cctns-normalize.js';
import { enrichWithMasterIds, remapComplaintMasterIds } from '../services/master-mapping.js';

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

const parseDdMmYyyy = (value: string): Date => {
  const [dd, mm, yyyy] = value.split('/').map((part) => Number(part));
  return new Date(yyyy, mm - 1, dd);
};

const formatDdMmYyyy = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const collectComplaintsByRange = async (timeFrom: string, timeTo: string) => {
  const start = parseDdMmYyyy(timeFrom);
  const end = parseDdMmYyyy(timeTo);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('Invalid date range. Expected DD/MM/YYYY with timeFrom <= timeTo');
  }

  const rows: CctnsComplaintRow[] = [];
  const WINDOW_DAYS = 3;
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + WINDOW_DAYS - 1);
    if (chunkEnd > end) {
      chunkEnd.setTime(end.getTime());
    }

    const chunkRows = await fetchCctnsComplaints(
      formatDdMmYyyy(chunkStart),
      formatDdMmYyyy(chunkEnd)
    );
    rows.push(...(chunkRows as CctnsComplaintRow[]));

    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return rows;
};

const saveNormalizedComplaints = async (rows: NormalizedCctnsComplaint[]) => {
  let created = 0;
  let updated = 0;
  let errors = 0;

  // Pre-filter invalid records
  const validRows = rows.filter((row, index) => {
    if (!row.complRegNum) {
      console.warn(`⚠️ Skipping record ${index}: missing complRegNum`);
      return false;
    }
    return true;
  });

  if (validRows.length < rows.length) {
    console.log(`ℹ️ Filtered out ${rows.length - validRows.length} invalid records`);
  }

  await processInBatches(validRows, 50, async (data) => {
    try {
      const mapped = await enrichWithMasterIds(data);
      
      // Validate required fields before DB operation
      if (!mapped.complRegNum) {
        throw new Error('Missing complRegNum after enrichment');
      }

      await prisma.complaint.upsert({
        where: { complRegNum: data.complRegNum },
        update: mapped,
        create: mapped,
      });
      updated++;
    } catch (error: any) {
      // Distinguish between different error types
      if (error.code === 'P2002') { // Unique constraint violation
        console.warn(`⚠️ Duplicate complaint: ${data.complRegNum}`);
        updated++; // Treat as update
      } else if (error.code === 'P2010') { // Invalid value
        console.error(`❌ Invalid data for ${data.complRegNum}:`, error.message);
        errors++;
      } else {
        console.error(`❌ Database error for ${data.complRegNum}:`, error.message);
        errors++;
      }
    }
  });

  created = Math.max(validRows.length - updated - errors, 0);
  return { created, updated, errors };
};

// In-memory job tracking for async fetch operations
interface FetchJob {
  id: string;
  status: 'pending' | 'running' | 'success' | 'error';
  timeFrom: string;
  timeTo: string;
  progress?: string;
  result?: {
    fetched: number;
    uniqueComplaints: number;
    created: number;
    updated: number;
    errors: number;
  };
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const fetchJobs = new Map<string, FetchJob>();

const runFetchJob = async (jobId: string, timeFrom: string, timeTo: string) => {
  const job = fetchJobs.get(jobId);
  if (!job) return;

  job.status = 'running';
  console.log(`[FETCH-JOB ${jobId}] Starting fetch job: ${timeFrom} to ${timeTo}`);

  try {
    // Validate date range early
    const startDate = parseDdMmYyyy(timeFrom);
    const endDate = parseDdMmYyyy(timeTo);
    
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      throw new Error(`Invalid date range: ${timeFrom} to ${timeTo}`);
    }

    job.progress = 'Fetching from CCTNS API...';
    console.log(`[FETCH-JOB ${jobId}] Fetching from CCTNS API...`);
    
    let complaints: CctnsComplaintRow[] = [];
    try {
      complaints = await collectComplaintsByRange(timeFrom, timeTo);
    } catch (fetchError: any) {
      console.error(`[FETCH-JOB ${jobId}] CCTNS API fetch failed:`, fetchError.message);
      throw new Error(`CCTNS API failed: ${fetchError.message}`);
    }
    
    job.progress = `Normalizing ${complaints.length} records...`;
    console.log(`[FETCH-JOB ${jobId}] Normalizing ${complaints.length} records...`);
    
    const normalized = toNormalizedUnique(complaints);
    
    job.progress = `Saving ${normalized.length} records to database...`;
    console.log(`[FETCH-JOB ${jobId}] Saving ${normalized.length} records to database...`);
    
    const { created, updated, errors } = await saveNormalizedComplaints(normalized);
    
    job.status = 'success';
    job.result = {
      fetched: complaints.length,
      uniqueComplaints: normalized.length,
      created,
      updated,
      errors,
    };
    job.completedAt = new Date();
    
    console.log(`[FETCH-JOB ${jobId}] Completed successfully:`, job.result);

    // Also create a SyncRun record for audit trail
    try {
      await prisma.syncRun.create({
        data: {
          kind: 'cctns-manual',
          status: errors > 0 ? 'partial' : 'success',
          startedAt: job.startedAt,
          endedAt: job.completedAt,
          fetchedCount: complaints.length,
          upsertedCount: created + updated,
          errorCount: errors,
          message: `Manual fetch: ${timeFrom} to ${timeTo}`,
        },
      });
    } catch (syncRunError: any) {
      console.error(`[FETCH-JOB ${jobId}] Failed to create sync run record:`, syncRunError.message);
      // Don't fail the job just because we couldn't create the audit record
    }
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    job.status = 'error';
    job.error = errorMsg;
    job.completedAt = new Date();
    
    console.error(`[FETCH-JOB ${jobId}] Job failed:`, errorMsg);

    // Always try to create error sync run for audit
    try {
      await prisma.syncRun.create({
        data: {
          kind: 'cctns-manual',
          status: 'error',
          startedAt: job.startedAt,
          endedAt: job.completedAt,
          errorCount: 1,
          message: `Manual fetch failed: ${timeFrom} to ${timeTo} — ${errorMsg}`,
        },
      });
    } catch (syncRunError: any) {
      console.error(`[FETCH-JOB ${jobId}] Failed to create error sync run record:`, syncRunError.message);
    }
  }
};

export const cctnsRoutes = async (fastify: FastifyInstance) => {
  // —— List complaints with pagination, search, filter ——
  fastify.get('/cctns', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const {
      page = '1',
      limit = '50',
      search = '',
      district = '',
      statusGroup = '',
      dateFrom = '',
      dateTo = '',
      sortBy = 'id',
      sortOrder = 'desc',
    } = request.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause using AND so multiple filters never overwrite each other
    const andConditions: any[] = [];

    if (search) {
      andConditions.push({
        OR: [
          { complRegNum:   { contains: search, mode: 'insensitive' } },
          { firstName:     { contains: search, mode: 'insensitive' } },
          { lastName:      { contains: search, mode: 'insensitive' } },
          { mobile:        { contains: search, mode: 'insensitive' } },
          { complDesc:     { contains: search, mode: 'insensitive' } },
          { districtName:  { contains: search, mode: 'insensitive' } },
          { addressPs:     { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (district) {
      // Separate AND block — never overwrites the search OR block
      andConditions.push({
        OR: [
          { districtName:    { contains: district, mode: 'insensitive' } },
          { addressDistrict: { contains: district, mode: 'insensitive' } },
        ],
      });
    }

    if (statusGroup) {
      andConditions.push({ statusGroup: statusGroup.toLowerCase() });
    }

    if (dateFrom || dateTo) {
      const dateFilter: any = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo)   dateFilter.lte = new Date(dateTo);
      andConditions.push({ complRegDt: dateFilter });
    }

    const where: any = andConditions.length > 0 ? { AND: andConditions } : {};


    // Validate sortBy to prevent injection
    const allowedSortFields = [
      'id', 'complRegNum', 'complRegDt', 'districtName', 'addressPs',
      'statusOfComplaint', 'disposalDate', 'createdAt', 'updatedAt',
    ];
    const orderByField = allowedSortFields.includes(sortBy) ? sortBy : 'id';
    const orderByDirection = sortOrder === 'asc' ? 'asc' : 'desc';

    const [records, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [orderByField]: orderByDirection },
      }),
      prisma.complaint.count({ where }),
    ]);

    return sendSuccess(reply, {
      data: records,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  });

  fastify.get('/cctns/district', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const counts = await prisma.complaint.groupBy({
      by: ['districtName', 'addressDistrict'],
      _count: { _all: true },
    });

    const districtMap = new Map<string, number>();
    for (const row of counts) {
      const district = row.addressDistrict || row.districtName || 'Unknown';
      districtMap.set(district, (districtMap.get(district) || 0) + row._count._all);
    }

    const data = Array.from(districtMap.entries()).map(([district, count]) => ({
      district,
      count,
    }));

    return sendSuccess(reply, data);
  });

  fastify.get('/cctns/status', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    try {
      const secretKey = process.env.CCTNS_SECRET_KEY;
      const decryptKey = process.env.CCTNS_DECRYPT_KEY;
      const complaintApi = process.env.CCTNS_COMPLAINT_API;

      const configured = !!(
        secretKey &&
        secretKey !== 'your_secret_key_here' &&
        decryptKey &&
        decryptKey !== 'your_decrypt_key_here' &&
        complaintApi
      );

      return sendSuccess(reply, {
        configured,
        hasSecretKey: !!secretKey && secretKey !== 'your_secret_key_here',
        hasDecryptKey: !!decryptKey && decryptKey !== 'your_decrypt_key_here',
        hasApis: !!complaintApi,
      });
    } catch {
      return sendError(reply, 'Failed to get CCTNS status');
    }
  });

  fastify.post('/cctns/token', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    try {
      clearCctnsToken();
      const token = await getCctnsToken();
      return sendSuccess(reply, { token: `${token.substring(0, 20)}...` }, 'Token obtained');
    } catch (error) {
      return sendError(
        reply,
        `Failed to get token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // —— Deprecated: direct live fetch without persistence ——
  // Kept for backward compatibility but marked as deprecated
  fastify.get('/cctns/complaints-live', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { timeFrom, timeTo } = request.query as Record<string, string>;
      if (!timeFrom || !timeTo) {
        return sendError(reply, 'timeFrom and timeTo query params are required (format: DD/MM/YYYY)');
      }

      const complaints = await fetchCctnsComplaints(timeFrom, timeTo);
      return sendSuccess(reply, {
        total: complaints.length,
        timeFrom,
        timeTo,
        records: complaints,
        deprecated: true,
        note: 'This endpoint does not persist data. Use POST /cctns/fetch-and-sync instead.',
      });
    } catch (error) {
      return sendError(
        reply,
        `Failed to fetch data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // —— Unified: Fetch from CCTNS API and persist directly to DB ——
  fastify.post('/cctns/fetch-and-sync', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { timeFrom, timeTo } = request.body as Record<string, string>;
      if (!timeFrom || !timeTo) {
        return sendError(reply, 'timeFrom and timeTo are required');
      }

      // Validate date format
      const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!dateRegex.test(timeFrom) || !dateRegex.test(timeTo)) {
        return sendError(reply, 'Invalid date format. Expected DD/MM/YYYY');
      }

      const jobId = `fetch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const job: FetchJob = {
        id: jobId,
        status: 'pending',
        timeFrom,
        timeTo,
        startedAt: new Date(),
      };
      fetchJobs.set(jobId, job);

      // Start the job asynchronously — do not await
      runFetchJob(jobId, timeFrom, timeTo).catch((error) => {
        console.error(`[FETCH-JOB ${jobId}] Unhandled error:`, error);
        const j = fetchJobs.get(jobId);
        if (j) {
          j.status = 'error';
          j.error = error instanceof Error ? error.message : 'Unknown error';
          j.completedAt = new Date();
        }
      });

      // Return immediately with job ID for polling
      return sendSuccess(reply, {
        jobId,
        status: 'pending',
        message: 'Fetch and sync job started. Poll GET /cctns/fetch-status/:jobId for progress.',
      }, 'Fetch job started', 202);
    } catch (error) {
      console.error('[FETCH-AND-SYNC] Failed to start job:', error);
      return sendError(reply, `Failed to start fetch job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // —— Poll fetch job status ——
  fastify.get('/cctns/fetch-status/:jobId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { jobId } = request.params as Record<string, string>;
    const job = fetchJobs.get(jobId);

    if (!job) {
      return sendNotFound(reply, 'Fetch job not found');
    }

    return sendSuccess(reply, {
      id: job.id,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  });

  // —— Deprecated: manual sync endpoint (redundant after fetch-and-sync) ——
  fastify.post('/cctns/sync-complaints', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    try {
      const { timeFrom, timeTo } = request.body as Record<string, string>;
      if (!timeFrom || !timeTo) {
        return sendError(reply, 'timeFrom and timeTo are required');
      }

      const complaints = await collectComplaintsByRange(timeFrom, timeTo);
      const normalized = toNormalizedUnique(complaints);
      const { created, updated, errors } = await saveNormalizedComplaints(normalized);

      return sendSuccess(reply, {
        message: 'Sync completed (deprecated: use POST /cctns/fetch-and-sync)',
        fetched: complaints.length,
        uniqueComplaints: normalized.length,
        created,
        updated,
        errors,
        deprecated: true,
      });
    } catch (error) {
      return sendError(reply, `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // —— Sync run history ——
  fastify.get('/cctns/sync-runs', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { page = '1', limit = '20' } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [runs, total] = await Promise.all([
      prisma.syncRun.findMany({
        orderBy: { startedAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.syncRun.count(),
    ]);

    return sendSuccess(reply, {
      data: runs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  });

  fastify.post('/cctns/remap-masters', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    try {
      const stats = await remapComplaintMasterIds();
      return sendSuccess(reply, stats, 'Master mapping recomputed');
    } catch (error) {
      return sendError(reply, `Remap failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  fastify.get('/cctns/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    const record = await prisma.complaint.findUnique({ where: { id: parseInt(id, 10) } });
    if (!record) return sendNotFound(reply, 'Record not found');
    return sendSuccess(reply, record);
  });

  fastify.post('/cctns', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const data = await enrichWithMasterIds(request.body as Record<string, any>);
    if (!data.complRegNum) {
      return sendError(reply, 'complRegNum is required');
    }
    const record = await prisma.complaint.create({ data: data as any });
    return sendSuccess(reply, record, 'Record created');
  });

  fastify.put('/cctns/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    const data = await enrichWithMasterIds(request.body as Record<string, any>);
    const record = await prisma.complaint.update({
      where: { id: parseInt(id, 10) },
      data: data as any,
    });
    return sendSuccess(reply, record, 'Record updated');
  });

  fastify.delete('/cctns/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    await prisma.complaint.delete({ where: { id: parseInt(id, 10) } });
    return sendSuccess(reply, null, 'Record deleted');
  });
};

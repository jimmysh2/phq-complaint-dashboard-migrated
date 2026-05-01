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

  await processInBatches(rows, 100, async (data) => {
    try {
      const mapped = await enrichWithMasterIds(data);
      await prisma.complaint.upsert({
        where: { complRegNum: data.complRegNum },
        update: mapped,
        create: mapped,
      });
      updated++;
    } catch {
      errors++;
    }
  });

  created = Math.max(rows.length - updated - errors, 0);
  return { created, updated, errors };
};

export const cctnsRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/cctns', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const records = await prisma.complaint.findMany({
      orderBy: { id: 'desc' },
      take: 500,
    });

    return sendSuccess(reply, records);
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
      });
    } catch (error) {
      return sendError(
        reply,
        `Failed to fetch data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

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
        message: 'Sync completed',
        fetched: complaints.length,
        uniqueComplaints: normalized.length,
        created,
        updated,
        errors,
      });
    } catch (error) {
      return sendError(reply, `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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

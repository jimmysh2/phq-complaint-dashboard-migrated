import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { getDistrictNameByIdMap } from '../services/master-mapping.js';

type BucketStats = { total: number; pending: number; disposed: number; unknown: number; missingDates: number };

const toStats = (): BucketStats => ({ total: 0, pending: 0, disposed: 0, unknown: 0, missingDates: 0 });

const updateStats = (stats: BucketStats, statusGroup: string, isDisposedMissingDate: boolean) => {
  stats.total++;
  if (statusGroup === 'pending') stats.pending++;
  else if (statusGroup === 'disposed') stats.disposed++;
  else stats.unknown++;
  if (isDisposedMissingDate) stats.missingDates++;
};

export const reportRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/reports/district', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const [districtMapById, complaints] = await Promise.all([
      getDistrictNameByIdMap(),
      prisma.complaint.findMany({
        select: { districtMasterId: true, statusGroup: true, isDisposedMissingDate: true },
      }),
    ]);
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.districtMasterId ? districtMapById.get(comp.districtMasterId.toString()) || 'Unmapped' : 'Unmapped';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([district, stats]) => ({ district, ...stats })));
  });

  fastify.get('/reports/mode-receipt', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { receptionMode: { not: '' } },
      select: { receptionMode: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.receptionMode || 'Unknown';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([mode, stats]) => ({ mode, count: stats.total, ...stats })));
  });

  fastify.get('/reports/nature-incident', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { classOfIncident: { not: '' } },
      select: { classOfIncident: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.classOfIncident || 'Unknown';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([natureOfIncident, stats]) => ({ natureOfIncident, ...stats })));
  });

  fastify.get('/reports/type-against', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { respondentCategories: { not: '' } },
      select: { respondentCategories: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.respondentCategories || 'Unknown';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([typeAgainst, stats]) => ({ typeAgainst, ...stats })));
  });

  fastify.get('/reports/status', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      select: { statusRaw: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.statusRaw || 'Unknown';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([status, stats]) => ({ status, count: stats.total, ...stats })));
  });

  fastify.get('/reports/complaint-source', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { complaintSource: { not: '' } },
      select: { complaintSource: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.complaintSource || 'Unknown';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([complaintSource, stats]) => ({ complaintSource, ...stats })));
  });

  fastify.get('/reports/type-complaint', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { classOfIncident: { not: '' } },
      select: { classOfIncident: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.classOfIncident || 'Unmapped';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([typeOfComplaint, stats]) => ({ typeOfComplaint, ...stats })));
  });

  fastify.get('/reports/branch-wise', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { branch: { not: '' } },
      select: { branch: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.branch || 'Unknown';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([branch, stats]) => ({ branch, ...stats })));
  });

  fastify.get('/reports/highlights', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { classOfIncident: { not: '' } },
      select: { classOfIncident: true },
    });
    const map = new Map<string, number>();
    for (const comp of complaints) {
      const key = comp.classOfIncident || 'Unmapped';
      map.set(key, (map.get(key) || 0) + 1);
    }
    const data = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));
    return sendSuccess(reply, data);
  });

  fastify.get('/reports/date-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { fromDate, toDate } = request.query as { fromDate?: string; toDate?: string };
    const where: any = {};
    if (fromDate && toDate) {
      where.complRegDt = { gte: new Date(fromDate), lte: new Date(toDate) };
    }
    const [districtMapById, complaints] = await Promise.all([
      getDistrictNameByIdMap(),
      prisma.complaint.findMany({
        where,
        select: { districtMasterId: true, statusGroup: true, isDisposedMissingDate: true },
      }),
    ]);
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.districtMasterId ? districtMapById.get(comp.districtMasterId.toString()) || 'Unmapped' : 'Unmapped';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([district, stats]) => ({ district, ...stats })));
  });

  fastify.get('/reports/action-taken', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { actionTaken: { not: '' } },
      select: { actionTaken: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      const key = comp.actionTaken || 'Unknown';
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([actionTaken, stats]) => ({ actionTaken, ...stats })));
  });
};

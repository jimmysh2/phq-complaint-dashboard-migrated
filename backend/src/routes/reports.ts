import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { getDistrictNameByIdMap, getPoliceStationNameByIdMap } from '../services/master-mapping.js';
import { buildPrismaWhereClause } from '../utils/filters.js';

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
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
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

  fastify.get('/reports/mode-receipt', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const complaints = await prisma.complaint.findMany({
      where,
      select: { receptionMode: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      if (!comp.receptionMode) continue;
      const key = comp.receptionMode;
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([mode, stats]) => ({ mode, count: stats.total, ...stats })));
  });

  fastify.get('/reports/nature-incident', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const complaints = await prisma.complaint.findMany({
      where,
      select: { classOfIncident: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      if (!comp.classOfIncident) continue;
      const key = comp.classOfIncident;
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([natureOfIncident, stats]) => ({ natureOfIncident, ...stats })));
  });

  fastify.get('/reports/type-against', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const complaints = await prisma.complaint.findMany({
      where,
      select: { respondentCategories: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      if (!comp.respondentCategories) continue;
      const key = comp.respondentCategories;
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([typeAgainst, stats]) => ({ typeAgainst, ...stats })));
  });

  fastify.get('/reports/status', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const complaints = await prisma.complaint.findMany({
      where,
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
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const complaints = await prisma.complaint.findMany({
      where,
      select: { complaintSource: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      if (!comp.complaintSource) continue;
      const key = comp.complaintSource;
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([complaintSource, stats]) => ({ complaintSource, ...stats })));
  });

  fastify.get('/reports/type-complaint', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const complaints = await prisma.complaint.findMany({
      where,
      select: { classOfIncident: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      if (!comp.classOfIncident) continue;
      const key = comp.classOfIncident;
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([typeOfComplaint, stats]) => ({ typeOfComplaint, ...stats })));
  });

  fastify.get('/reports/branch-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const complaints = await prisma.complaint.findMany({
      where,
      select: { branch: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      if (!comp.branch) continue;
      const key = comp.branch;
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([branch, stats]) => ({ branch, ...stats })));
  });

  fastify.get('/reports/highlights', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const complaints = await prisma.complaint.findMany({
      where,
      select: { classOfIncident: true },
    });
    const map = new Map<string, number>();
    for (const comp of complaints) {
      if (!comp.classOfIncident) continue;
      map.set(comp.classOfIncident, (map.get(comp.classOfIncident) || 0) + 1);
    }
    const data = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));
    return sendSuccess(reply, data);
  });

  fastify.get('/reports/date-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
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
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const complaints = await prisma.complaint.findMany({
      where,
      select: { actionTaken: true, statusGroup: true, isDisposedMissingDate: true },
    });
    const map = new Map<string, BucketStats>();
    for (const comp of complaints) {
      if (!comp.actionTaken) continue;
      const key = comp.actionTaken;
      const stats = map.get(key) || toStats();
      updateStats(stats, comp.statusGroup, comp.isDisposedMissingDate);
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([actionTaken, stats]) => ({ actionTaken, ...stats })));
  });

  fastify.get('/reports/oldest-pending', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const query = request.query as any;
    const where = buildPrismaWhereClause(query);
    const targetDistrictId = query.districtMasterId;

    if (targetDistrictId) {
      // PS-wise for specific district
      const psOldest = await prisma.complaint.findMany({
        where: { ...where, statusGroup: 'pending', complRegDt: { not: null }, districtMasterId: BigInt(targetDistrictId) },
        distinct: ['policeStationMasterId'],
        orderBy: [
          { policeStationMasterId: 'asc' },
          { complRegDt: 'asc' }
        ],
        select: {
          policeStationMasterId: true,
          complRegDt: true,
          complRegNum: true,
        }
      });

      const psMap = await getPoliceStationNameByIdMap();
      
      const results = psOldest.map(c => {
        const psId = c.policeStationMasterId ? c.policeStationMasterId.toString() : null;
        return {
          id: psId,
          type: 'ps',
          name: psId && psMap.has(psId) ? psMap.get(psId) : 'Unmapped',
          oldestDate: c.complRegDt,
          complaintNumber: c.complRegNum
        };
      });
      return sendSuccess(reply, results);

    } else {
      // District-wise for all districts
      const districtOldest = await prisma.complaint.findMany({
        where: { ...where, statusGroup: 'pending', complRegDt: { not: null } },
        distinct: ['districtMasterId'],
        orderBy: [
          { districtMasterId: 'asc' },
          { complRegDt: 'asc' }
        ],
        select: {
          districtMasterId: true,
          complRegDt: true,
          complRegNum: true,
        }
      });

      const districtMap = await getDistrictNameByIdMap();
      
      const results = districtOldest.map(c => {
        const distId = c.districtMasterId ? c.districtMasterId.toString() : null;
        return {
          id: distId,
          type: 'district',
          name: distId && districtMap.has(distId) ? districtMap.get(distId) : 'Unmapped',
          oldestDate: c.complRegDt,
          complaintNumber: c.complRegNum
        };
      });
      return sendSuccess(reply, results);
    }
  });
};

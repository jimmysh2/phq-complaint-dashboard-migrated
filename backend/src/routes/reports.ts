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
    const [districtMapById, grouped] = await Promise.all([
      getDistrictNameByIdMap(),
      prisma.complaint.groupBy({
        by: ['districtMasterId', 'statusGroup', 'isDisposedMissingDate'],
        where,
        _count: { _all: true },
      }),
    ]);
    const map = new Map<string, BucketStats>();
    for (const g of grouped) {
      const key = g.districtMasterId ? districtMapById.get(g.districtMasterId.toString()) || 'Unmapped' : 'Unmapped';
      const stats = map.get(key) || toStats();
      const count = g._count._all;
      stats.total += count;
      if (g.statusGroup === 'pending') stats.pending += count;
      else if (g.statusGroup === 'disposed') stats.disposed += count;
      else stats.unknown += count;
      if (g.isDisposedMissingDate) stats.missingDates += count;
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([district, stats]) => ({ district, ...stats })));
  });

  fastify.get('/reports/mode-receipt', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const grouped = await prisma.complaint.groupBy({
      by: ['receptionMode', 'statusGroup', 'isDisposedMissingDate'],
      where,
      _count: { _all: true },
    });
    const map = new Map<string, BucketStats>();
    for (const g of grouped) {
      if (!g.receptionMode) continue;
      const key = g.receptionMode;
      const stats = map.get(key) || toStats();
      const count = g._count._all;
      stats.total += count;
      if (g.statusGroup === 'pending') stats.pending += count;
      else if (g.statusGroup === 'disposed') stats.disposed += count;
      else stats.unknown += count;
      if (g.isDisposedMissingDate) stats.missingDates += count;
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([mode, stats]) => ({ mode, count: stats.total, ...stats })));
  });


  fastify.get('/reports/type-against', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const grouped = await prisma.complaint.groupBy({
      by: ['respondentCategories', 'statusGroup', 'isDisposedMissingDate'],
      where,
      _count: { _all: true },
    });
    const map = new Map<string, BucketStats>();
    for (const g of grouped) {
      if (!g.respondentCategories) continue;
      const key = g.respondentCategories;
      const stats = map.get(key) || toStats();
      const count = g._count._all;
      stats.total += count;
      if (g.statusGroup === 'pending') stats.pending += count;
      else if (g.statusGroup === 'disposed') stats.disposed += count;
      else stats.unknown += count;
      if (g.isDisposedMissingDate) stats.missingDates += count;
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([typeAgainst, stats]) => ({ typeAgainst, ...stats })));
  });

  fastify.get('/reports/status', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const grouped = await prisma.complaint.groupBy({
      by: ['statusRaw', 'statusGroup', 'isDisposedMissingDate'],
      where,
      _count: { _all: true },
    });
    const map = new Map<string, BucketStats>();
    for (const g of grouped) {
      const key = g.statusRaw || 'Unknown';
      const stats = map.get(key) || toStats();
      const count = g._count._all;
      stats.total += count;
      if (g.statusGroup === 'pending') stats.pending += count;
      else if (g.statusGroup === 'disposed') stats.disposed += count;
      else stats.unknown += count;
      if (g.isDisposedMissingDate) stats.missingDates += count;
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([status, stats]) => ({ status, count: stats.total, ...stats })));
  });

  fastify.get('/reports/complaint-source', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const grouped = await prisma.complaint.groupBy({
      by: ['complaintSource', 'statusGroup', 'isDisposedMissingDate'],
      where,
      _count: { _all: true },
    });
    const map = new Map<string, BucketStats>();
    for (const g of grouped) {
      if (!g.complaintSource) continue;
      const key = g.complaintSource;
      const stats = map.get(key) || toStats();
      const count = g._count._all;
      stats.total += count;
      if (g.statusGroup === 'pending') stats.pending += count;
      else if (g.statusGroup === 'disposed') stats.disposed += count;
      else stats.unknown += count;
      if (g.isDisposedMissingDate) stats.missingDates += count;
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([complaintSource, stats]) => ({ complaintSource, ...stats })));
  });

  fastify.get('/reports/type-complaint', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const grouped = await prisma.complaint.groupBy({
      by: ['classOfIncident', 'statusGroup', 'isDisposedMissingDate'],
      where,
      _count: { _all: true },
    });
    const map = new Map<string, BucketStats>();
    for (const g of grouped) {
      if (!g.classOfIncident) continue;
      const key = g.classOfIncident;
      const stats = map.get(key) || toStats();
      const count = g._count._all;
      stats.total += count;
      if (g.statusGroup === 'pending') stats.pending += count;
      else if (g.statusGroup === 'disposed') stats.disposed += count;
      else stats.unknown += count;
      if (g.isDisposedMissingDate) stats.missingDates += count;
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([typeOfComplaint, stats]) => ({ typeOfComplaint, ...stats })));
  });

  fastify.get('/reports/branch-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const grouped = await prisma.complaint.groupBy({
      by: ['branch', 'statusGroup', 'isDisposedMissingDate'],
      where,
      _count: { _all: true },
    });
    const map = new Map<string, BucketStats>();
    for (const g of grouped) {
      if (!g.branch) continue;
      const key = g.branch;
      const stats = map.get(key) || toStats();
      const count = g._count._all;
      stats.total += count;
      if (g.statusGroup === 'pending') stats.pending += count;
      else if (g.statusGroup === 'disposed') stats.disposed += count;
      else stats.unknown += count;
      if (g.isDisposedMissingDate) stats.missingDates += count;
      map.set(key, stats);
    }
    return sendSuccess(reply, Array.from(map.entries()).map(([branch, stats]) => ({ branch, ...stats })));
  });

  fastify.get('/reports/highlights', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = buildPrismaWhereClause(request.query);
    const grouped = await prisma.complaint.groupBy({
      by: ['classOfIncident'],
      where,
      _count: { _all: true },
    });
    const data = grouped
      .filter(g => g.classOfIncident)
      .map(g => ({ category: g.classOfIncident, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
    return sendSuccess(reply, data);
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

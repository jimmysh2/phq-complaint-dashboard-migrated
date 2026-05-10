import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess, sendCached } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { getDistrictNameByIdMap, getPoliceStationNameByIdMap } from '../services/master-mapping.js';
import { buildPrismaWhereClause, buildRawWhereClause } from '../utils/filters.js';
import { cached } from '../utils/cache.js';

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
    const q = JSON.stringify(request.query);
    const data = await cached(`report-district:${q}`, 5 * 60 * 1000, async () => {
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
      return Array.from(map.entries()).map(([district, stats]) => ({ district, ...stats }));
    });
    return sendCached(reply, data);
  });

  fastify.get('/reports/mode-receipt', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const q = JSON.stringify(request.query);
    const data = await cached(`report-mode-receipt:${q}`, 5 * 60 * 1000, async () => {
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
      return Array.from(map.entries()).map(([mode, stats]) => ({ mode, count: stats.total, ...stats }));
    });
    return sendCached(reply, data);
  });


  fastify.get('/reports/type-against', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const q = JSON.stringify(request.query);
    const data = await cached(`report-type-against:${q}`, 5 * 60 * 1000, async () => {
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
      return Array.from(map.entries()).map(([typeAgainst, stats]) => ({ typeAgainst, ...stats }));
    });
    return sendCached(reply, data);
  });

  fastify.get('/reports/status', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const q = JSON.stringify(request.query);
    const data = await cached(`report-status:${q}`, 5 * 60 * 1000, async () => {
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
      return Array.from(map.entries()).map(([status, stats]) => ({ status, count: stats.total, ...stats }));
    });
    return sendCached(reply, data);
  });

  fastify.get('/reports/complaint-source', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const q = JSON.stringify(request.query);
    const data = await cached(`report-complaint-source:${q}`, 5 * 60 * 1000, async () => {
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
      return Array.from(map.entries()).map(([complaintSource, stats]) => ({ complaintSource, ...stats }));
    });
    return sendCached(reply, data);
  });

  fastify.get('/reports/type-complaint', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const q = JSON.stringify(request.query);
    const data = await cached(`report-type-complaint:${q}`, 5 * 60 * 1000, async () => {
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
      return Array.from(map.entries()).map(([typeOfComplaint, stats]) => ({ typeOfComplaint, ...stats }));
    });
    return sendCached(reply, data);
  });

  fastify.get('/reports/branch-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const q = JSON.stringify(request.query);
    const data = await cached(`report-branch-wise:${q}`, 5 * 60 * 1000, async () => {
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
      return Array.from(map.entries()).map(([branch, stats]) => ({ branch, ...stats }));
    });
    return sendCached(reply, data);
  });

  fastify.get('/reports/highlights', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const q = JSON.stringify(request.query);
    const data = await cached(`report-highlights:${q}`, 5 * 60 * 1000, async () => {
      const where = buildPrismaWhereClause(request.query);
    const grouped = await prisma.complaint.groupBy({
      by: ['classOfIncident'],
      where,
      _count: { _all: true },
    });
      return grouped
        .filter(g => g.classOfIncident)
        .map(g => ({ category: g.classOfIncident, count: g._count._all }))
        .sort((a, b) => b.count - a.count);
    });
    return sendCached(reply, data);
  });


  fastify.get('/reports/oldest-pending', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const query = request.query as any;
    const q = JSON.stringify(query);
    const data = await cached(`report-oldest-pending:${q}`, 5 * 60 * 1000, async () => {
      const filterWhere = buildRawWhereClause(query);
      const targetDistrictId = query.districtMasterId;

    if (targetDistrictId) {
      // PS-wise for specific district
      // Make sure we filter by the selected district as well.
      // buildRawWhereClause handles districtMasterId if passed in query!
      const psOldest = await prisma.$queryRaw<any[]>`
        SELECT "policeStationMasterId" as police_station_master_id, "complRegDt" as compl_reg_dt, "complRegNum" as compl_reg_num
        FROM (
          SELECT 
            "policeStationMasterId", "complRegDt", "complRegNum",
            ROW_NUMBER() OVER(PARTITION BY "policeStationMasterId" ORDER BY "complRegDt" ASC) as rn
          FROM "Complaint"
          WHERE ${filterWhere}
            AND "districtMasterId" = ${BigInt(targetDistrictId)}
            AND "statusGroup" = 'pending' AND "complRegDt" IS NOT NULL
        ) sub
        WHERE rn = 1
      `;
      const psMap = await getPoliceStationNameByIdMap();
      
      const results = psOldest.map(c => {
        const psId = c.police_station_master_id ? c.police_station_master_id.toString() : null;
        return {
          id: psId,
          type: 'ps',
          name: psId && psMap.has(psId) ? psMap.get(psId) : 'Unmapped',
          oldestDate: c.compl_reg_dt,
          complaintNumber: c.compl_reg_num
        };
      });
        return results;
      } else {
      // District-wise for all districts
      const districtOldest = await prisma.$queryRaw<any[]>`
        SELECT "districtMasterId" as district_master_id, "complRegDt" as compl_reg_dt, "complRegNum" as compl_reg_num
        FROM (
          SELECT 
            "districtMasterId", "complRegDt", "complRegNum",
            ROW_NUMBER() OVER(PARTITION BY "districtMasterId" ORDER BY "complRegDt" ASC) as rn
          FROM "Complaint"
          WHERE ${filterWhere}
            AND "statusGroup" = 'pending' AND "complRegDt" IS NOT NULL
        ) sub
        WHERE rn = 1
      `;
      const districtMap = await getDistrictNameByIdMap();
      
      const results = districtOldest.map(c => {
        const distId = c.district_master_id ? c.district_master_id.toString() : null;
        return {
          id: distId,
          type: 'district',
          name: distId && districtMap.has(distId) ? districtMap.get(distId) : 'Unmapped',
          oldestDate: c.compl_reg_dt,
          complaintNumber: c.compl_reg_num
        };
      });
        return results;
      }
    });
    return sendCached(reply, data);
  });
};

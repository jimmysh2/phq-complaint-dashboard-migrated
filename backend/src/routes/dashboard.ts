import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { buildPrismaWhereClause } from '../utils/filters.js';
import {
  getDistrictNameByIdMap,
  getPoliceStationNameByIdMap,
} from '../services/master-mapping.js';

const UNMAPPED = 'Unmapped';

const withAnd = (baseWhere: any, extraWhere: any) => ({
  AND: [baseWhere, extraWhere].filter(Boolean),
});

const getDistrictLabel = (id: bigint | null, map: Map<string, string>) => {
  if (!id) return UNMAPPED;
  return map.get(id.toString()) || UNMAPPED;
};

const getPoliceStationLabel = (id: bigint | null, map: Map<string, string>) => {
  if (!id) return UNMAPPED;
  return map.get(id.toString()) || UNMAPPED;
};

export const dashboardRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/dashboard/summary', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const baseWhere = buildPrismaWhereClause(request.query);
    const totalReceived = await prisma.complaint.count({ where: baseWhere });
    const totalDisposed = await prisma.complaint.count({ where: withAnd(baseWhere, { statusGroup: 'disposed' }) });
    const totalPending = await prisma.complaint.count({ where: withAnd(baseWhere, { statusGroup: 'pending' }) });
    // Complaints where CCTNS API provided no recognizable status value
    const totalUnknown = await prisma.complaint.count({ where: withAnd(baseWhere, { statusGroup: 'unknown' }) });
    const disposedMissingDateCount = await prisma.complaint.count({
      where: withAnd(baseWhere, { statusGroup: 'disposed', isDisposedMissingDate: true }),
    });

    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const pending15 = await prisma.complaint.count({
      where: withAnd(baseWhere, { statusGroup: 'pending', complRegDt: { lte: fifteenDaysAgo, gt: oneMonthAgo } }),
    });
    const pendingOver1 = await prisma.complaint.count({
      where: withAnd(baseWhere, { statusGroup: 'pending', complRegDt: { lte: oneMonthAgo, gt: twoMonthsAgo } }),
    });
    const pendingOver2 = await prisma.complaint.count({
      where: withAnd(baseWhere, { statusGroup: 'pending', complRegDt: { lte: twoMonthsAgo } }),
    });

    const disposedComplaints = await prisma.complaint.findMany({
      where: withAnd(baseWhere, {
        statusGroup: 'disposed',
        isDisposedMissingDate: false,
        complRegDt: { not: null },
        disposalDate: { not: null },
      }),
      select: { complRegDt: true, disposalDate: true },
    });

    let totalDisposalDays = 0;
    for (const c of disposedComplaints) {
      if (c.complRegDt && c.disposalDate) {
        totalDisposalDays += (c.disposalDate.getTime() - c.complRegDt.getTime()) / (1000 * 60 * 60 * 24);
      }
    }

    const avgDisposalTime = disposedComplaints.length > 0
      ? Math.round(totalDisposalDays / disposedComplaints.length)
      : 0;

    const latestSync = await prisma.syncRun.findFirst({
      where: { status: 'success' },
      orderBy: { endedAt: 'desc' },
      select: { endedAt: true }
    });

    return sendSuccess(reply, {
      totalReceived,
      totalDisposed,
      totalPending,
      totalUnknown,          // Status not provided by CCTNS API
      disposedMissingDateCount, // Disposed but no disposal date from API
      pendingOverFifteenDays: pending15,
      pendingOverOneMonth: pendingOver1,
      pendingOverTwoMonths: pendingOver2,
      avgDisposalTime,
      lastSyncTime: latestSync?.endedAt || null,
    });
  });

  fastify.get('/dashboard/district-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const [districtMapById, complaints] = await Promise.all([
      getDistrictNameByIdMap(),
      prisma.complaint.findMany({
        where: buildPrismaWhereClause(request.query),
        select: { districtMasterId: true, statusGroup: true, isDisposedMissingDate: true },
      }),
    ]);

    const districtMap = new Map<string, { total: number; pending: number; disposed: number; unknown: number; missingDates: number }>();
    for (const comp of complaints) {
      const district = getDistrictLabel(comp.districtMasterId, districtMapById);
      const stats = districtMap.get(district) || { total: 0, pending: 0, disposed: 0, unknown: 0, missingDates: 0 };
      stats.total++;
      if (comp.statusGroup === 'pending') stats.pending++;
      else if (comp.statusGroup === 'disposed') stats.disposed++;
      else stats.unknown++;
      if (comp.isDisposedMissingDate) stats.missingDates++;
      districtMap.set(district, stats);
    }

    return sendSuccess(reply, Array.from(districtMap.entries()).map(([district, stats]) => ({ district, ...stats })));
  });

  fastify.get('/dashboard/duration-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: buildPrismaWhereClause(request.query),
      select: { complRegDt: true, statusGroup: true },
    });

    const durationMap = new Map<string, { total: number; pending: number; disposed: number; unknown: number; sortKey: number }>();
    for (const comp of complaints) {
      if (!comp.complRegDt) continue;
      const d = new Date(comp.complRegDt);
      const key = `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
      const stats = durationMap.get(key) || { total: 0, pending: 0, disposed: 0, unknown: 0, sortKey: d.getTime() };
      stats.total++;
      if (comp.statusGroup === 'pending') stats.pending++;
      else if (comp.statusGroup === 'disposed') stats.disposed++;
      else stats.unknown++;
      durationMap.set(key, stats);
    }

    return sendSuccess(
      reply,
      Array.from(durationMap.entries())
        .sort((a, b) => a[1].sortKey - b[1].sortKey)
        .map(([duration, stats]) => ({ duration, total: stats.total, pending: stats.pending, disposed: stats.disposed, unknown: stats.unknown }))
    );
  });

  fastify.get('/dashboard/date-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { fromDate, toDate } = request.query as Record<string, string>;
    if (!fromDate || !toDate) return sendError(reply, 'fromDate and toDate are required');

    const [districtMapById, complaints] = await Promise.all([
      getDistrictNameByIdMap(),
      prisma.complaint.findMany({
        where: {
          ...buildPrismaWhereClause(request.query),
          complRegDt: { gte: new Date(fromDate), lte: new Date(toDate) },
        },
        select: { districtMasterId: true, statusGroup: true },
      }),
    ]);

    const districtMap = new Map<string, { total: number; pending: number; disposed: number }>();
    for (const comp of complaints) {
      const district = getDistrictLabel(comp.districtMasterId, districtMapById);
      const stats = districtMap.get(district) || { total: 0, pending: 0, disposed: 0 };
      stats.total++;
      if (comp.statusGroup === 'pending') stats.pending++;
      if (comp.statusGroup === 'disposed') stats.disposed++;
      districtMap.set(district, stats);
    }

    return sendSuccess(
      reply,
      Array.from(districtMap.entries()).map(([district, stats]) => ({
        district,
        totalComplaints: stats.total,
        pending: stats.pending,
        disposed: stats.disposed,
      }))
    );
  });

  fastify.get('/dashboard/month-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: buildPrismaWhereClause(request.query),
      select: { complRegDt: true, statusGroup: true },
      orderBy: { complRegDt: 'asc' },
    });

    const monthMap = new Map<string, { total: number; pending: number }>();
    for (const comp of complaints) {
      if (!comp.complRegDt) continue;
      const key = `${comp.complRegDt.getFullYear()}-${String(comp.complRegDt.getMonth() + 1).padStart(2, '0')}`;
      const stats = monthMap.get(key) || { total: 0, pending: 0 };
      stats.total++;
      if (comp.statusGroup === 'pending') stats.pending++;
      monthMap.set(key, stats);
    }

    return sendSuccess(
      reply,
      Array.from(monthMap.entries()).map(([month, stats]) => ({
        month,
        year: Number(month.split('-')[0]),
        monthNum: Number(month.split('-')[1]),
        total: stats.total,
        pending: stats.pending,
      }))
    );
  });

  fastify.get('/dashboard/ageing-matrix', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const [districtMapById, complaints] = await Promise.all([
      getDistrictNameByIdMap(),
      prisma.complaint.findMany({
        where: withAnd(buildPrismaWhereClause(request.query), { statusGroup: 'pending', complRegDt: { not: null } }),
        select: { districtMasterId: true, complRegDt: true },
      }),
    ]);

    const now = Date.now();
    const matrixMap = new Map<string, { u7: number; u15: number; u30: number; o30: number }>();
    for (const comp of complaints) {
      const district = getDistrictLabel(comp.districtMasterId, districtMapById);
      const stats = matrixMap.get(district) || { u7: 0, u15: 0, u30: 0, o30: 0 };
      const days = (now - comp.complRegDt!.getTime()) / (1000 * 60 * 60 * 24);
      if (days < 7) stats.u7++;
      else if (days < 15) stats.u15++;
      else if (days < 30) stats.u30++;
      else stats.o30++;
      matrixMap.set(district, stats);
    }

    return sendSuccess(reply, Array.from(matrixMap.entries()).map(([district, stats]) => ({ district, ...stats })));
  });

  fastify.get('/dashboard/disposal-matrix', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const baseWhere = buildPrismaWhereClause(request.query);
    const [districtMapById, complaints] = await Promise.all([
      getDistrictNameByIdMap(),
      prisma.complaint.findMany({
        where: withAnd(baseWhere, {
          statusGroup: 'disposed',
          isDisposedMissingDate: false,
          complRegDt: { not: null },
          disposalDate: { not: null },
        }),
        select: { districtMasterId: true, complRegDt: true, disposalDate: true },
      }),
    ]);

    const matrixMap = new Map<string, { u7: number; u15: number; u30: number; o30: number }>();
    for (const comp of complaints) {
      const district = getDistrictLabel(comp.districtMasterId, districtMapById);
      const stats = matrixMap.get(district) || { u7: 0, u15: 0, u30: 0, o30: 0 };
      const days = (comp.disposalDate!.getTime() - comp.complRegDt!.getTime()) / (1000 * 60 * 60 * 24);
      if (days < 7) stats.u7++;
      else if (days < 15) stats.u15++;
      else if (days < 30) stats.u30++;
      else stats.o30++;
      matrixMap.set(district, stats);
    }

    const missingDates = await prisma.complaint.count({
      where: withAnd(baseWhere, { statusGroup: 'disposed', isDisposedMissingDate: true }),
    });

    return sendSuccess(reply, {
      rows: Array.from(matrixMap.entries()).map(([district, stats]) => ({ district, ...stats })),
      missingDisposalDates: missingDates,
    });
  });

  fastify.get<{ Params: { district: string } }>('/dashboard/district-analysis/:district', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const districtParam = decodeURIComponent(request.params.district || '').trim();
    const baseWhere = buildPrismaWhereClause(request.query);

    let districtFilter: any;
    if (!districtParam || districtParam.toLowerCase() === UNMAPPED.toLowerCase()) {
      districtFilter = { districtMasterId: null };
    } else {
      const district = await prisma.district.findFirst({ where: { name: { equals: districtParam, mode: 'insensitive' } } });
      if (!district) {
        return sendSuccess(reply, { district: districtParam, policeStations: [], categories: [] });
      }
      districtFilter = { districtMasterId: district.id };
    }

    const [stationMapById, complaints] = await Promise.all([
      getPoliceStationNameByIdMap(),
      prisma.complaint.findMany({
        where: withAnd(baseWhere, districtFilter),
        select: {
          policeStationMasterId: true,
          statusGroup: true,
          complRegDt: true,
          disposalDate: true,
          isDisposedMissingDate: true,
          classOfIncident: true,
        },
      }),
    ]);

    const now = Date.now();
    const psMap = new Map<string, {
      total: number; pending: number; disposed: number; unknown: number; missingDates: number;
      u7: number; u15: number; u30: number; o30: number;
      du7: number; du15: number; du30: number; do30: number; totalDisposalDays: number;
    }>();
    const categoryMap = new Map<string, { total: number; pending: number; disposed: number; unknown: number; missingDates: number }>();

    for (const comp of complaints) {
      const ps = getPoliceStationLabel(comp.policeStationMasterId, stationMapById);
      const category = comp.classOfIncident || UNMAPPED;
      const stats = psMap.get(ps) || {
        total: 0, pending: 0, disposed: 0, unknown: 0, missingDates: 0,
        u7: 0, u15: 0, u30: 0, o30: 0,
        du7: 0, du15: 0, du30: 0, do30: 0,
        totalDisposalDays: 0,
      };
      const catStats = categoryMap.get(category) || { total: 0, pending: 0, disposed: 0, unknown: 0, missingDates: 0 };

      stats.total++;
      catStats.total++;

      if (comp.statusGroup === 'pending') {
        stats.pending++;
        catStats.pending++;
        if (comp.complRegDt) {
          const days = (now - comp.complRegDt.getTime()) / (1000 * 60 * 60 * 24);
          if (days < 7) stats.u7++;
          else if (days < 15) stats.u15++;
          else if (days < 30) stats.u30++;
          else stats.o30++;
        }
      } else if (comp.statusGroup === 'disposed') {
        stats.disposed++;
        catStats.disposed++;
        if (comp.isDisposedMissingDate) {
          stats.missingDates++;
          catStats.missingDates++;
        } else if (comp.complRegDt && comp.disposalDate) {
          const days = (comp.disposalDate.getTime() - comp.complRegDt.getTime()) / (1000 * 60 * 60 * 24);
          stats.totalDisposalDays += days;
          if (days < 7) stats.du7++;
          else if (days < 15) stats.du15++;
          else if (days < 30) stats.du30++;
          else stats.do30++;
        }
      } else {
        // status not found in this record
        stats.unknown++;
        catStats.unknown++;
      }

      psMap.set(ps, stats);
      categoryMap.set(category, catStats);
    }

    const policeStations = Array.from(psMap.entries()).map(([ps, stats]) => ({
      ps,
      total: stats.total,
      pending: stats.pending,
      disposed: stats.disposed,
      unknown: stats.unknown,      // status not found in record
      missingDates: stats.missingDates,
      u7: stats.u7,
      u15: stats.u15,
      u30: stats.u30,
      o30: stats.o30,
      du7: stats.du7,
      du15: stats.du15,
      du30: stats.du30,
      do30: stats.do30,
      avgDisposalDays: stats.disposed - stats.missingDates > 0
        ? Math.round(stats.totalDisposalDays / (stats.disposed - stats.missingDates))
        : 0,
    }));

    const categories = Array.from(categoryMap.entries()).map(([category, stats]) => ({ category, ...stats }));

    return sendSuccess(reply, {
      district: districtParam || UNMAPPED,
      policeStations,
      categories,
    });
  });

  fastify.get('/dashboard/category-wise', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: buildPrismaWhereClause(request.query),
      select: { classOfIncident: true, statusGroup: true, isDisposedMissingDate: true },
    });

    const categoryMap = new Map<string, { total: number; pending: number; disposed: number; unknown: number; missingDates: number }>();
    for (const comp of complaints) {
      const category = comp.classOfIncident || UNMAPPED;
      const stats = categoryMap.get(category) || { total: 0, pending: 0, disposed: 0, unknown: 0, missingDates: 0 };
      stats.total++;
      if (comp.statusGroup === 'pending') stats.pending++;
      else if (comp.statusGroup === 'disposed') stats.disposed++;
      else stats.unknown++;
      if (comp.isDisposedMissingDate) stats.missingDates++;
      categoryMap.set(category, stats);
    }

    const data = Array.from(categoryMap.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => b.total - a.total);

    return sendSuccess(reply, data);
  });
};

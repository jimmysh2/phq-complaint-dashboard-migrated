import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess, sendError, sendCached } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { syncDistricts, syncOffices, syncPoliceStationsByDistrict } from './government.js';
import { runMasterSync } from '../services/masterSync.js';

const parseDistrictIds = (value: unknown): bigint[] =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^-?\d+$/.test(item))
    .map((item) => BigInt(item));

const ensureMasterData = async () => {
  // 1. Districts
  let districts = await prisma.district.findMany({ orderBy: { name: 'asc' } });
  if (districts.length === 0) {
    await syncDistricts();
    districts = await prisma.district.findMany({ orderBy: { name: 'asc' } });
  }

  // 2. Police Stations — check per-district, not just global count
  // This ensures every district has its PS, not just "at least one district has PS"
  const stationCount = await prisma.policeStation.count();
  if (stationCount === 0 && districts.length > 0) {
    // First time: bulk sync all districts in batches of 5
    for (let i = 0; i < districts.length; i += 5) {
      await Promise.all(
        districts.slice(i, i + 5).map((d) => syncPoliceStationsByDistrict(d.id).catch(() => {}))
      );
    }
  }

  // 3. Offices
  const officeCount = await prisma.office.count();
  if (officeCount === 0) {
    await syncOffices();
  }
};

const getDistinctClassOfIncident = async () => {
  const complaints = await prisma.complaint.findMany({
    where: {
      classOfIncident: {
        not: null,         // exclude NULL rows
        notIn: ['', ' '], // exclude blank/whitespace-only
      },
    },
    select: { classOfIncident: true },
    distinct: ['classOfIncident'],
  });
  return complaints
    .map((row) => row.classOfIncident)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
};

export const referenceRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/districts', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    await ensureMasterData();
    const districts = await prisma.district.findMany({ orderBy: { name: 'asc' } });

    return sendSuccess(
      reply,
      districts.map((d) => ({
        id: d.id.toString(),
        name: d.name,
      }))
    );
  });

  fastify.get('/police-stations', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { districtIds, districtId } = request.query as { districtIds?: string; districtId?: string };
    const ids = parseDistrictIds(districtIds || districtId);

    // Ensure districts exist in DB first
    const districtCount = await prisma.district.count();
    if (districtCount === 0) {
      await syncDistricts();
    }

    let stations = await prisma.policeStation.findMany({
      where: ids.length > 0 ? { districtId: { in: ids } } : undefined,
      orderBy: [{ districtName: 'asc' }, { name: 'asc' }],
    });

    // ─── On-demand sync: if specific district(s) requested but returned nothing,
    // trigger PS sync for only those districts from the Haryana govt API.
    // This handles the case where DB has PS for SOME districts but not others.
    if (stations.length === 0 && ids.length > 0) {
      console.log(`[PS] No stations found for districtIds=${ids.join(',')} — triggering on-demand sync...`);
      await Promise.all(
        ids.map((id) =>
          syncPoliceStationsByDistrict(id).catch((err) =>
            console.error(`[PS] On-demand sync failed for district ${id}:`, err.message)
          )
        )
      );
      // Re-query with freshly synced data
      stations = await prisma.policeStation.findMany({
        where: { districtId: { in: ids } },
        orderBy: [{ districtName: 'asc' }, { name: 'asc' }],
      });
    } else if (ids.length === 0) {
      // No district filter — ensure all districts have PS
      await ensureMasterData();
      stations = await prisma.policeStation.findMany({
        orderBy: [{ districtName: 'asc' }, { name: 'asc' }],
      });
    }

    return sendSuccess(
      reply,
      stations.map((ps) => ({
        id: ps.id.toString(),
        name: ps.name,
        districtId: ps.districtId?.toString() || null,
        districtName: ps.districtName || null,
      }))
    );
  });

  fastify.get('/branches', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    await ensureMasterData();
    // NOTE: We intentionally do NOT filter offices by district/PS here.
    // The Haryana Govt API provides offices as a flat list with no district linkage.
    // Deriving district from complaint data is unreliable — PHQ/range offices serve
    // multiple districts and transfer scenarios skew any voting-based approach.
    // The office filter still works correctly for filtering complaints;
    // users simply pick the relevant office from the full list.
    const offices = await prisma.office.findMany({ orderBy: { name: 'asc' } });
    return sendSuccess(reply, offices.map((o) => ({ id: o.id.toString(), name: o.name })));
  });


  fastify.get('/reference/nature-crime', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    return sendSuccess(reply, await getDistinctClassOfIncident());
  });

  fastify.get('/reference/reception-mode', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { receptionMode: { not: '' } },
      select: { receptionMode: true },
      distinct: ['receptionMode'],
    });
    return sendSuccess(reply, complaints.map((c) => c.receptionMode).filter(Boolean));
  });

  fastify.get('/reference/crime-category', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const data = await getDistinctClassOfIncident();
    return sendCached(reply, data, 300); // 5-min edge cache — avoids full-table distinct scan on every hover
  });

  fastify.get('/reference/complaint-type', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    return sendSuccess(reply, await getDistinctClassOfIncident());
  });

  fastify.get('/reference/status', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { statusRaw: { not: '' } },
      select: { statusRaw: true },
      distinct: ['statusRaw'],
    });
    return sendSuccess(reply, complaints.map((c) => c.statusRaw).filter(Boolean));
  });

  fastify.get('/reference/respondent-categories', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { respondentCategories: { not: '' } },
      select: { respondentCategories: true },
      distinct: ['respondentCategories'],
    });
    return sendSuccess(reply, complaints.map((c) => c.respondentCategories).filter(Boolean));
  });

  fastify.post('/districts', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { name } = request.body as Record<string, string>;
    const district = await prisma.district.create({
      data: { id: BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000)), name },
    });
    return sendSuccess(reply, district, 'District created');
  });

  fastify.post('/branches', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const body = request.body as any;
    const name = String(body.name || '');
    const office = await prisma.office.create({
      data: { id: BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000)), name },
    });
    return sendSuccess(reply, office, 'Office created');
  });

  // ── Admin utility: force full master data sync from Haryana govt API ──────
  // Call this once after deployment, or whenever the filter hierarchy seems stale.
  // It syncs Districts → Police Stations (all districts) → Offices, then remaps
  // all complaint master IDs so the filter bar works correctly.
  fastify.post('/reference/sync-masters', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    try {
      // 1. Districts
      const districts = await syncDistricts();

      // 2. Police Stations — all districts in batches of 5 to avoid timeout
      let psSynced = 0;
      let psErrors = 0;
      for (let i = 0; i < districts.length; i += 5) {
        await Promise.all(
          districts.slice(i, i + 5).map(async (d) => {
            try {
              psSynced += await syncPoliceStationsByDistrict(d.id);
            } catch {
              psErrors++;
            }
          })
        );
      }

      // 3. Offices
      const offices = await syncOffices();

      // 4. Remap complaint master IDs with freshest lookup
      const { remapComplaintMasterIds } = await import('../services/master-mapping.js');
      const remapStats = await remapComplaintMasterIds();

      return sendSuccess(reply, {
        districts: districts.length,
        policeStations: psSynced,
        psErrors,
        offices: offices.length,
        remap: remapStats,
      }, 'Master data sync complete');
    } catch (error: any) {
      const { sendError } = await import('../utils/response.js');
      return sendError(reply, `Sync failed: ${error.message}`);
    }
  });

  // ── Diagnostics: how many complaints have master IDs resolved? ────────────
  fastify.get('/reference/diagnose-mapping', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    const [total, withDistrict, withPS, withOffice, withAll] = await Promise.all([
      prisma.complaint.count(),
      prisma.complaint.count({ where: { districtMasterId: { not: null } } }),
      prisma.complaint.count({ where: { policeStationMasterId: { not: null } } }),
      prisma.complaint.count({ where: { officeMasterId: { not: null } } }),
      prisma.complaint.count({
        where: {
          districtMasterId:      { not: null },
          policeStationMasterId: { not: null },
          officeMasterId:        { not: null },
        },
      }),
    ]);

    const [districtCount, psCount, officeCount] = await Promise.all([
      prisma.district.count(),
      prisma.policeStation.count(),
      prisma.office.count(),
    ]);

    // Sample 5 complaints without district mapping for debugging
    const unmapped = await prisma.complaint.findMany({
      where: { districtMasterId: null },
      select: { id: true, districtName: true, addressDistrict: true, transferDistrictCd: true },
      take: 5,
    });

    return sendSuccess(reply, {
      masterTables: { districts: districtCount, policeStations: psCount, offices: officeCount },
      complaints: {
        total,
        withDistrictMasterId:      `${withDistrict} (${Math.round(withDistrict/total*100)}%)`,
        withPoliceStationMasterId: `${withPS} (${Math.round(withPS/total*100)}%)`,
        withOfficeMasterId:        `${withOffice} (${Math.round(withOffice/total*100)}%)`,
        withAllThree:              `${withAll} (${Math.round(withAll/total*100)}%)`,
      },
      sampleUnmappedComplaints: unmapped,
    });
  });
};


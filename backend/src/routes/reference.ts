import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { syncDistricts, syncOffices, syncPoliceStationsByDistrict } from './government.js';

const parseDistrictIds = (value: unknown): bigint[] =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^-?\d+$/.test(item))
    .map((item) => BigInt(item));

const ensureMasterData = async () => {
  let districts = await prisma.district.findMany({ orderBy: { name: 'asc' } });
  if (districts.length === 0) {
    await syncDistricts();
    districts = await prisma.district.findMany({ orderBy: { name: 'asc' } });
  }

  const stationCount = await prisma.policeStation.count();
  if (stationCount === 0 && districts.length > 0) {
    for (const district of districts) {
      await syncPoliceStationsByDistrict(district.id);
    }
  }

  const officeCount = await prisma.office.count();
  if (officeCount === 0) {
    await syncOffices();
  }
};

const getDistinctClassOfIncident = async () => {
  const complaints = await prisma.complaint.findMany({
    where: { classOfIncident: { not: '' } },
    select: { classOfIncident: true },
    distinct: ['classOfIncident'],
  });
  return complaints
    .map((row) => row.classOfIncident)
    .filter((value): value is string => !!value)
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
    await ensureMasterData();
    const { districtIds, districtId } = request.query as { districtIds?: string; districtId?: string };
    const ids = parseDistrictIds(districtIds || districtId);

    const stations = await prisma.policeStation.findMany({
      where: ids.length > 0 ? { districtId: { in: ids } } : undefined,
      orderBy: [{ districtName: 'asc' }, { name: 'asc' }],
    });

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
  }, async (_request, reply) => {
    await ensureMasterData();
    const offices = await prisma.office.findMany({ orderBy: { name: 'asc' } });

    return sendSuccess(
      reply,
      offices.map((o) => ({
        id: o.id.toString(),
        name: o.name,
      }))
    );
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
    return sendSuccess(reply, await getDistinctClassOfIncident());
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
};

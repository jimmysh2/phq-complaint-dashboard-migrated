import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess, sendError, sendNotFound } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { classifyComplaintStatus } from '../services/status.js';
import { enrichWithMasterIds } from '../services/master-mapping.js';

export const complaintRoutes = async (fastify: FastifyInstance) => {
  const toBigInt = (value: unknown): bigint | null => {
    const raw = String(value ?? '').trim();
    if (!raw || !/^-?\d+$/.test(raw)) return null;
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  };

  const enrichLocationFields = async (input: Record<string, any>): Promise<Record<string, any>> => {
    const { districtId, policeStationId, officeId, ...rest } = input;
    const normalized: Record<string, any> = { ...rest };
    const districtMasterId = toBigInt(districtId);
    const policeStationMasterId = toBigInt(policeStationId);
    const officeMasterId = toBigInt(officeId);

    if (!normalized.districtName && districtId) {
      const district = await prisma.district.findUnique({ where: { id: toBigInt(districtId) ?? BigInt(-1) } });
      if (district) normalized.districtName = district.name;
    }

    if (!normalized.addressPs && policeStationId) {
      const station = await prisma.policeStation.findUnique({ where: { id: toBigInt(policeStationId) ?? BigInt(-1) } });
      if (station) normalized.addressPs = station.name;
    }

    return enrichWithMasterIds({
      ...normalized,
      districtMasterId,
      policeStationMasterId,
      officeMasterId,
    }) as Promise<Record<string, any>>;
  };

  fastify.get('/complaints', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { page = '1', limit = '10', search = '' } = request.query as Record<string, string>;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: any = search ? {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search, mode: 'insensitive' } },
        { complRegNum: { contains: search, mode: 'insensitive' } },
        { complDesc: { contains: search, mode: 'insensitive' } },
      ],
    } : {};

    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { id: 'desc' },
      }),
      prisma.complaint.count({ where }),
    ]);

    return sendSuccess(reply, {
      data: complaints,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  });

  fastify.get('/complaints/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    
    const complaintId = parseInt(id);
    if (isNaN(complaintId)) {
      return sendError(reply, 'Invalid complaint ID', 400);
    }
    
    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      return sendNotFound(reply, 'Complaint not found');
    }

    return sendSuccess(reply, complaint);
  });

  fastify.post('/complaints', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const data = await enrichLocationFields(request.body as Record<string, any>);
    if (!data.complRegNum) {
      return sendError(reply, 'complRegNum is required', 400);
    }
    const disposalDate = data.disposalDate ? new Date(data.disposalDate) : null;
    const statusRaw = data.statusRaw || data.statusOfComplaint || null;
    const { statusGroup, isDisposedMissingDate } = classifyComplaintStatus(statusRaw, disposalDate);

    const result = await prisma.complaint.create({
      data: {
        ...data,
        complRegNum: String(data.complRegNum),
        statusRaw,
        statusOfComplaint: data.statusOfComplaint || statusRaw,
        disposalDate,
        statusGroup,
        isDisposedMissingDate,
      },
    });

    return sendSuccess(reply, { id: result.id }, 'Complaint created successfully');
  });

  fastify.put('/complaints/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as Record<string, string>;
    const data = await enrichLocationFields(request.body as Record<string, any>);

    const complaintId = parseInt(id);
    if (isNaN(complaintId)) {
      return sendError(reply, 'Invalid complaint ID', 400);
    }

    const existing = await prisma.complaint.findUnique({
      where: { id: complaintId },
    });

    if (!existing) {
      return sendNotFound(reply, 'Complaint not found');
    }

    const disposalDate = data.disposalDate ? new Date(data.disposalDate) : null;
    const statusRaw = data.statusRaw || data.statusOfComplaint || existing.statusRaw || null;
    const { statusGroup, isDisposedMissingDate } = classifyComplaintStatus(statusRaw, disposalDate);

    await prisma.complaint.update({
      where: { id: complaintId },
      data: {
        ...data,
        complRegNum: data.complRegNum ? String(data.complRegNum) : existing.complRegNum,
        statusRaw,
        statusOfComplaint: data.statusOfComplaint || statusRaw,
        disposalDate,
        statusGroup,
        isDisposedMissingDate,
      },
    });

    return sendSuccess(reply, null, 'Complaint updated successfully');
  });

  fastify.delete('/complaints/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as Record<string, string>;

    const complaintId = parseInt(id);
    if (isNaN(complaintId)) {
      return sendError(reply, 'Invalid complaint ID', 400);
    }

    const existing = await prisma.complaint.findUnique({
      where: { id: complaintId },
    });

    if (!existing) {
      return sendNotFound(reply, 'Complaint not found');
    }

    await prisma.complaint.delete({
      where: { id: complaintId },
    });

    return sendSuccess(reply, null, 'Complaint deleted successfully');
  });
};

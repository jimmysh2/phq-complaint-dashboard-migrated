import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { buildPrismaWhereClause } from '../utils/filters.js';

// Only the fields the Pending page actually renders — avoids transferring heavy
// text columns like complDesc, ioDetails, respondentCategories, etc.
const PENDING_SELECT = {
  id:              true,
  complRegNum:     true,
  complRegDt:      true,
  firstName:       true,
  lastName:        true,
  mobile:          true,
  addressDistrict: true,
  districtName:    true,
  branch:          true,
  statusGroup:     true,
  statusOfComplaint: true,
} as const;

export const pendingRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/pending/all', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = { ...buildPrismaWhereClause(request.query), statusGroup: 'pending' as const };
    const complaints = await prisma.complaint.findMany({
      where,
      select: PENDING_SELECT,
      orderBy: { complRegDt: 'asc' },
      take: 5000,
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/15-30-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const where = {
      ...buildPrismaWhereClause(request.query),
      statusGroup: 'pending' as const,
      complRegDt: { lte: fifteenDaysAgo, gt: thirtyDaysAgo },
    };
    const complaints = await prisma.complaint.findMany({
      where,
      select: PENDING_SELECT,
      orderBy: { complRegDt: 'asc' },
      take: 5000,
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/30-60-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const where = {
      ...buildPrismaWhereClause(request.query),
      statusGroup: 'pending' as const,
      complRegDt: { lte: thirtyDaysAgo, gt: sixtyDaysAgo },
    };
    const complaints = await prisma.complaint.findMany({
      where,
      select: PENDING_SELECT,
      orderBy: { complRegDt: 'asc' },
      take: 5000,
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/over-60-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const where = {
      ...buildPrismaWhereClause(request.query),
      statusGroup: 'pending' as const,
      complRegDt: { lte: sixtyDaysAgo },
    };
    const complaints = await prisma.complaint.findMany({
      where,
      select: PENDING_SELECT,
      orderBy: { complRegDt: 'asc' },
      take: 5000,
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/branch/:branch', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { branch } = request.params as { branch: string };
    const complaints = await prisma.complaint.findMany({
      where: { branch, statusGroup: 'pending' },
      select: PENDING_SELECT,
      orderBy: { complRegDt: 'asc' },
      take: 5000,
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/branch/:branch/15-30-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { branch } = request.params as { branch: string };
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const complaints = await prisma.complaint.findMany({
      where: { branch, statusGroup: 'pending', complRegDt: { lte: fifteenDaysAgo, gt: thirtyDaysAgo } },
      select: PENDING_SELECT,
      orderBy: { complRegDt: 'asc' },
      take: 5000,
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/branch/:branch/30-60-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { branch } = request.params as { branch: string };
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const complaints = await prisma.complaint.findMany({
      where: { branch, statusGroup: 'pending', complRegDt: { lte: thirtyDaysAgo, gt: sixtyDaysAgo } },
      select: PENDING_SELECT,
      orderBy: { complRegDt: 'asc' },
      take: 5000,
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/branch/:branch/over-60-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { branch } = request.params as { branch: string };
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const complaints = await prisma.complaint.findMany({
      where: { branch, statusGroup: 'pending', complRegDt: { lte: sixtyDaysAgo } },
      select: PENDING_SELECT,
      orderBy: { complRegDt: 'asc' },
      take: 5000,
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/branches', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: { branch: { not: '' } },
      select: { branch: true },
      distinct: ['branch'],
    });
    const branches = complaints.map(c => c.branch).filter(Boolean);
    return sendSuccess(reply, branches);
  });
};

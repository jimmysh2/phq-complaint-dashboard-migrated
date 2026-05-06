import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { buildPrismaWhereClause } from '../utils/filters.js';

export const pendingRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/pending/all', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const where = { ...buildPrismaWhereClause(request.query), statusGroup: 'pending' as const };
    const complaints = await prisma.complaint.findMany({ where, orderBy: { complRegDt: 'asc' } });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/15-30-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const baseWhere = buildPrismaWhereClause(request.query);
    const where = {
      ...baseWhere,
      statusGroup: 'pending' as const,
      complRegDt: { lte: fifteenDaysAgo, gt: thirtyDaysAgo },
    };
    const complaints = await prisma.complaint.findMany({ where, orderBy: { complRegDt: 'asc' } });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/30-60-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const baseWhere = buildPrismaWhereClause(request.query);
    const where = {
      ...baseWhere,
      statusGroup: 'pending' as const,
      complRegDt: { lte: thirtyDaysAgo, gt: sixtyDaysAgo },
    };
    const complaints = await prisma.complaint.findMany({ where, orderBy: { complRegDt: 'asc' } });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/over-60-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const baseWhere = buildPrismaWhereClause(request.query);
    const where = {
      ...baseWhere,
      statusGroup: 'pending' as const,
      complRegDt: { lte: sixtyDaysAgo },
    };
    const complaints = await prisma.complaint.findMany({ where, orderBy: { complRegDt: 'asc' } });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/branch/:branch', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { branch } = request.params as { branch: string };
    const complaints = await prisma.complaint.findMany({
      where: { branch, statusGroup: 'pending' },
      orderBy: { complRegDt: 'asc' },
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
      orderBy: { complRegDt: 'asc' },
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
      orderBy: { complRegDt: 'asc' },
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
      orderBy: { complRegDt: 'asc' },
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

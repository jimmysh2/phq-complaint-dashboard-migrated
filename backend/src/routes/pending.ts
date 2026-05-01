import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database.js';
import { sendSuccess } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';

const PENDING_WHERE = { statusGroup: 'pending' as const };

export const pendingRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/pending/all', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const complaints = await prisma.complaint.findMany({
      where: PENDING_WHERE,
      orderBy: { complRegDt: 'asc' },
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/15-30-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const complaints = await prisma.complaint.findMany({
      where: {
        complRegDt: { lte: fifteenDaysAgo, gt: thirtyDaysAgo },
        ...PENDING_WHERE,
      },
      orderBy: { complRegDt: 'asc' },
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/30-60-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const complaints = await prisma.complaint.findMany({
      where: {
        complRegDt: { lte: thirtyDaysAgo, gt: sixtyDaysAgo },
        ...PENDING_WHERE,
      },
      orderBy: { complRegDt: 'asc' },
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/over-60-days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const complaints = await prisma.complaint.findMany({
      where: {
        complRegDt: { lte: sixtyDaysAgo },
        ...PENDING_WHERE,
      },
      orderBy: { complRegDt: 'asc' },
    });
    return sendSuccess(reply, complaints);
  });

  fastify.get('/pending/branch/:branch', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { branch } = request.params as { branch: string };

    const complaints = await prisma.complaint.findMany({
      where: { branch, ...PENDING_WHERE },
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
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const complaints = await prisma.complaint.findMany({
      where: {
        branch,
        complRegDt: { lte: fifteenDaysAgo, gt: thirtyDaysAgo },
        ...PENDING_WHERE,
      },
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
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const complaints = await prisma.complaint.findMany({
      where: {
        branch,
        complRegDt: { lte: thirtyDaysAgo, gt: sixtyDaysAgo },
        ...PENDING_WHERE,
      },
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
      where: {
        branch,
        complRegDt: { lte: sixtyDaysAgo },
        ...PENDING_WHERE,
      },
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

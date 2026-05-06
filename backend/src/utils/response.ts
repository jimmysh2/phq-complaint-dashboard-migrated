import { FastifyReply } from 'fastify';
import type { ApiResponse } from '../types/index.js';

export const sendSuccess = <T>(
  reply: FastifyReply,
  data: T,
  message = 'Success',
  statusCode = 200
) => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
  };
  return reply.code(statusCode).send(response);
};

/**
 * Like sendSuccess but adds Cache-Control headers.
 *
 * On Vercel, in-memory caches reset per invocation (serverless is stateless).
 * Cache-Control headers tell Vercel's edge network to cache the response
 * so identical requests within `ttlSeconds` don't hit the DB at all.
 *
 * @param ttlSeconds - How long to cache (default: 5 minutes)
 */
export const sendCached = <T>(
  reply: FastifyReply,
  data: T,
  ttlSeconds = 300,
  message = 'Success'
) => {
  reply.header('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}, stale-while-revalidate=60`);
  return sendSuccess(reply, data, message);
};


export const sendError = (
  reply: FastifyReply,
  message: string,
  statusCode = 400,
  error?: string
) => {
  const response: ApiResponse = {
    success: false,
    message,
    error,
  };
  return reply.code(statusCode).send(response);
};

export const sendNotFound = (reply: FastifyReply, message = 'Resource not found') => {
  return sendError(reply, message, 404);
};

export const sendUnauthorized = (reply: FastifyReply, message = 'Unauthorized') => {
  return sendError(reply, message, 401);
};

export const sendForbidden = (reply: FastifyReply, message = 'Forbidden') => {
  return sendError(reply, message, 403);
};

export const sendInternalError = (
  reply: FastifyReply,
  message = 'Internal server error',
  error?: string
) => {
  return sendError(reply, message, 500, error);
};
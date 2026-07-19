import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export function errorCode(error: unknown): string {
  if (error instanceof ZodError) return "INPUT_SCHEMA_INVALID";
  if (error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)) return error.message;
  return "INTERNAL_ERROR";
}

export function handleError(error: unknown, _request: FastifyRequest, reply: FastifyReply): void {
  const code = errorCode(error);
  const status = code === "INTERNAL_ERROR" ? 500 : 400;
  void reply.status(status).send({ error: { code } });
}

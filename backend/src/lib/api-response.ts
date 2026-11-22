import type { Response } from "express";
import { config } from "../config.js";

export interface ApiErrorBody {
  ok: false;
  error: string;
  message?: string;
  details?: unknown;
  requestId?: string;
  apiVersion: string;
}

export interface ApiOkBody<T = unknown> {
  ok: true;
  data?: T;
  [key: string]: unknown;
}

export function apiError(
  res: Response,
  status: number,
  error: string,
  options?: { message?: string; details?: unknown; requestId?: string; extra?: Record<string, unknown> },
): Response<ApiErrorBody> {
  const body: ApiErrorBody & Record<string, unknown> = {
    ok: false,
    error,
    apiVersion: config.apiVersion,
    ...(options?.message ? { message: options.message } : {}),
    ...(options?.details !== undefined ? { details: options.details } : {}),
    ...(options?.requestId ? { requestId: options.requestId } : {}),
    ...(options?.extra ?? {}),
  };
  return res.status(status).json(body);
}

export function apiOk<T extends Record<string, unknown>>(res: Response, body: T, status = 200): Response {
  return res.status(status).json({ ok: true, apiVersion: config.apiVersion, ...body });
}

import type { Response } from 'express';

export type AgentSseEventName =
  | 'run.started'
  | 'message.started'
  | 'response.delta'
  | 'tool.started'
  | 'tool.completed'
  | 'response.completed'
  | 'handoff.required'
  | 'error';

export function initializeSse(response: Response): void {
  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders?.();
}

export function writeSse(
  response: Response,
  event: AgentSseEventName,
  data: Record<string, unknown>,
): void {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export type RuntimeActor = {
  type: 'user' | 'service' | 'agent';
  id: string | null;
};

export type RuntimeUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
};

export type RuntimeCompletedResult = {
  runId: string;
  traceId: string;
  status: 'completed';
  provider: string;
  model: string;
  content: string;
  usage: RuntimeUsageSummary;
  latencyMs: number;
};

export type RuntimeSuspendedResult = {
  runId: string;
  traceId: string;
  status: 'suspended';
  provider: string | null;
  model: string | null;
  pendingApprovals: Array<{
    approvalRequestId: string;
    actionId: string;
    toolCode: string;
  }>;
  usage: RuntimeUsageSummary;
  latencyMs: number;
};

export type RuntimeCancelledResult = {
  runId: string;
  traceId: string;
  status: 'cancelled' | 'failed';
  reason: string;
};

export type RuntimeRunResult =
  | RuntimeCompletedResult
  | RuntimeSuspendedResult
  | RuntimeCancelledResult;

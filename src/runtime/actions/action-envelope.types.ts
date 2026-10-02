export type ToolSideEffect =
  | 'none'
  | 'reversible'
  | 'material'
  | 'destructive';

export type ToolRisk =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type ActionEnvelope = {
  id: string;
  runId: string;
  stepId: string;
  tool: string;
  toolVersion: string;
  capability: string;
  input: unknown;

  sideEffect: ToolSideEffect;
  risk: ToolRisk;

  requestedBy: {
    agentId: string;
    agentVersionId?: string | null;
  };

  target: {
    organizationId?: string | null;
    tenantId: string;
    resource?: string;
  };

  approval: {
    required: boolean;
    policyIds: string[];
    approvalRequestId?: string | null;
  };

  idempotencyKey?: string;
  timeoutMs: number;
};

export type PolicyDecision =
  | {
      result: 'allow';
      policyIds: string[];
    }
  | {
      result: 'approval_required';
      policyIds: string[];
      reason: string;
    }
  | {
      result: 'deny';
      policyIds: string[];
      reason: string;
    };

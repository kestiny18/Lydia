import type { ComputerUseDomain } from './contract.js';

export const COMPUTER_USE_ERROR_CODES = [
  'ARG_INVALID',
  'CAPABILITY_UNAVAILABLE',
  'POLICY_DENIED',
  'EXECUTION_FAILED',
  'OBSERVATION_MISSING',
] as const;

export type ComputerUseErrorCode = (typeof COMPUTER_USE_ERROR_CODES)[number];

export type ComputerUseRiskLevel = 'low' | 'medium' | 'high';

export type ObservationArtifactKind = 'download' | 'upload' | 'log';

export interface ComputerUseActionEnvelope {
  sessionId: string;
  actionId: string;
  domain: ComputerUseDomain;
  canonicalAction: string;
  args: Record<string, unknown>;
  riskLevel: ComputerUseRiskLevel;
  requestedAt: number;
}

export type ObservationBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; dataRef: string }
  | { type: 'artifact_ref'; kind: ObservationArtifactKind; path: string }
  | { type: 'structured_json'; payload: Record<string, unknown> };

export interface ObservationFrame {
  sessionId: string;
  actionId: string;
  frameId: string;
  blocks: ObservationBlock[];
  createdAt: number;
}

export interface ComputerUseCheckpoint {
  sessionId: string;
  taskId: string;
  lastActionId?: string;
  latestFrameIds: string[];
  verificationFailures: number;
  updatedAt: number;
}

export interface ComputerUseError {
  code: ComputerUseErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export function isComputerUseErrorCode(value: string): value is ComputerUseErrorCode {
  return (COMPUTER_USE_ERROR_CODES as readonly string[]).includes(value);
}

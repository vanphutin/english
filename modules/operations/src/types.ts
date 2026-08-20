export type AiProviderName = 'OPENAI' | 'SECONDARY_OPENAI_COMPATIBLE';
export type ProviderProtocol = 'RESPONSES' | 'CHAT_COMPLETIONS' | 'ANTHROPIC_MESSAGES';
export type ProviderErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'MODEL_UNAVAILABLE'
  | 'SCHEMA_UNSUPPORTED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'ENDPOINT_NOT_ALLOWED'
  | 'CONFIGURATION_INVALID';

export interface ProviderConfiguration {
  name: AiProviderName;
  baseUrl: string;
  apiKey: string;
  allowedHosts: string[];
  timeoutMs: number;
  maxTransientRetries: number;
}

export interface ProviderResult<T> {
  ok: boolean;
  value?: T;
  errorCode?: ProviderErrorCode;
  status?: number;
  latencyMs: number;
  requestId?: string;
}

export interface CapabilityCheck {
  capability:
    | 'TLS_HOST'
    | 'AUTH_MODELS'
    | 'CHAT_COMPLETIONS'
    | 'RESPONSES'
    | 'VIETNAMESE_UNICODE'
    | 'STRUCTURED_OUTPUT'
    | 'PROMPT_INJECTION_BOUNDARY';
  status: 'PASS' | 'FAIL' | 'UNSUPPORTED' | 'SKIPPED';
  latencyMs: number;
  errorCode?: ProviderErrorCode | null;
}

export interface CapabilityReport {
  schemaVersion: '1.0';
  probeVersion: string;
  provider: AiProviderName;
  baseHost: string;
  probedAt: string;
  status: 'VERIFIED' | 'PARTIAL' | 'UNAVAILABLE' | 'MISCONFIGURED';
  selectedModel?: string | null;
  models: string[];
  checks: CapabilityCheck[];
}

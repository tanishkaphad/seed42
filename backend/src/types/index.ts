export interface ApiResponse<T = unknown> {
  status: 'ok' | 'error';
  data?: T;
  message?: string;
  error?: {
    code: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: 'ok';
  service: string;
}

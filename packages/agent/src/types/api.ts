export interface ChatRequest {
  message: string;
  sessionId?: string;
}

export interface ChatResponse {
  sessionId: string;
  status: "processing" | "completed" | "error";
}

export interface StatusResponse {
  status: "ok" | "error";
  sessions: {
    id: string;
    startedAt: number;
    lastActivity: number;
  }[];
  uptime: number;
}

export interface ResetRequest {
  sessionId?: string;
}

export interface ResetResponse {
  status: "reset";
  sessionId: string;
  timestamp: number;
}

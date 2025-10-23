export interface ListenConfig {
  port: number;
  host: string;
  claudePath: string;
  workingDirectory: string;
  logLevel: "debug" | "info" | "warn" | "error";
  maxSessions: number;
  timeout: number;
}

export interface ClaudeManagerConfig {
  claudePath: string;
  workingDirectory: string;
  args?: string[];
}

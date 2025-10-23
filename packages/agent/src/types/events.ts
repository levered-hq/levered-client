export type EventType =
  | "connected"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "message"
  | "status"
  | "error"
  | "completed"
  | "raw_output";

export interface BaseEvent {
  type: EventType;
  timestamp: number;
}

export interface ConnectedEvent extends BaseEvent {
  type: "connected";
  clientId: string;
}

export interface ThinkingEvent extends BaseEvent {
  type: "thinking";
  content: string;
}

export interface ToolUseEvent extends BaseEvent {
  type: "tool_use";
  name: string;
  input: Record<string, any>;
}

export interface ToolResultEvent extends BaseEvent {
  type: "tool_result";
  content: string;
  success?: boolean;
}

export interface MessageEvent extends BaseEvent {
  type: "message";
  content: string;
}

export interface StatusEvent extends BaseEvent {
  type: "status";
  status: string;
  details?: string;
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  error: string;
  stack?: string;
}

export interface CompletedEvent extends BaseEvent {
  type: "completed";
  summary?: string;
}

export interface RawOutputEvent extends BaseEvent {
  type: "raw_output";
  content: string;
  ansi: boolean;
}

export type ClaudeEvent =
  | ConnectedEvent
  | ThinkingEvent
  | ToolUseEvent
  | ToolResultEvent
  | MessageEvent
  | StatusEvent
  | ErrorEvent
  | CompletedEvent
  | RawOutputEvent;

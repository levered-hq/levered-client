## Claude Code Proxy CLI - Implementation Plan

### Overview

A TypeScript CLI tool that proxies the existing `claude` CLI, exposing its capabilities through a local HTTP API with Server-Sent Events (SSE) streaming. This enables programmatic access to Claude Code's agentic capabilities (planning, execution, reasoning, tool use) from any application.

**Use Cases:**

- VS Code extensions that integrate Claude Code
- Web applications that need AI-powered code assistance
- Custom automation workflows
- Multi-agent systems that leverage Claude Code as a subprocess

### Architecture

```
┌──────────────────────────────────────────┐
│         HTTP Client (VS Code, etc)       │
└───────────────┬──────────────────────────┘
                │ POST /chat
                │ { message: "fix the bug" }
                ▼
┌────────────────────────────────────────────────────┐
│           TypeScript CLI Server (Express)          │
│  ┌──────────────────────────────────────────────┐  │
│  │         SSE Stream Manager                   │  │
│  │  - Manage client connections                 │  │
│  │  - Broadcast parsed events                   │  │
│  └─────────────────┬────────────────────────────┘  │
│                    │                                │
│  ┌─────────────────▼────────────────────────────┐  │
│  │         Output Parser                        │  │
│  │  - Parse ANSI output from claude CLI         │  │
│  │  - Extract: thinking, tool_use, results      │  │
│  │  - Convert to structured events              │  │
│  └─────────────────┬────────────────────────────┘  │
│                    │                                │
│  ┌─────────────────▼────────────────────────────┐  │
│  │         Claude CLI Manager                   │  │
│  │  - Spawn claude subprocess with PTY          │  │
│  │  - Pipe stdin (prompts)                      │  │
│  │  - Stream stdout/stderr                      │  │
│  │  - Handle process lifecycle                  │  │
│  └─────────────────┬────────────────────────────┘  │
└────────────────────┼────────────────────────────────┘
                     │ child_process.spawn()
                     ▼
              ┌─────────────┐
              │  claude CLI │ (runs in target codebase)
              │  (TUI mode) │
              └─────────────┘
```

**Key Design Decisions:**

1. **Proxy existing claude CLI** - Leverage Claude Code's existing implementation rather than reimplementing
2. **SSE for streaming** - Server-Sent Events provide one-way streaming with automatic reconnection
3. **Print mode with --continue** - Use Claude's `--print` mode for cleaner, non-interactive execution
   - `--print --output-format stream-json` provides structured JSON streaming output
   - Automatically bypasses workspace trust dialog (no `--dangerously-skip-permissions` needed)
   - No warning messages or interactive TUI complexity
   - Spawn a new Claude process for each message
4. **Session persistence** - Use `--continue` flag to maintain conversation context across messages
   - Claude manages session IDs automatically
   - Session ID is extracted from first response and used for subsequent messages
   - Conversation history is preserved via Claude's built-in session management

### Project Structure

```
claude-proxy/
├── src/
│   ├── cli.ts                    # CLI entry point, argument parsing
│   ├── server.ts                 # Express server setup and routes
│   ├── managers/
│   │   ├── claude-manager.ts     # Claude CLI subprocess management
│   │   └── session-manager.ts    # Multiple session support (optional)
│   ├── streaming/
│   │   ├── sse-manager.ts        # SSE connection management
│   │   └── event-emitter.ts      # Internal event bus
│   ├── parsers/
│   │   ├── output-parser.ts      # Main parser for claude output
│   │   ├── ansi-parser.ts        # ANSI escape code handling
│   │   └── event-extractor.ts    # Extract structured events
│   ├── types/
│   │   ├── api.ts                # API request/response types
│   │   ├── events.ts             # SSE event types
│   │   └── config.ts             # Configuration types
│   ├── utils/
│   │   ├── logger.ts             # Structured logging
│   │   └── errors.ts             # Custom error classes
│   └── constants.ts              # Constants and defaults
├── tests/
│   ├── unit/
│   │   ├── parser.test.ts
│   │   └── sse-manager.test.ts
│   ├── integration/
│   │   └── claude-manager.test.ts
│   └── e2e/
│       └── server.test.ts
├── examples/
│   ├── basic-usage.ts            # Example client usage
│   └── vscode-extension/         # Sample VS Code extension
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Component Details

#### 1. CLI Entry Point (`src/cli.ts`)

**Responsibilities:**

- Parse command-line arguments using `commander`
- Validate configuration
- Initialize and start HTTP server
- Handle graceful shutdown (SIGTERM, SIGINT)

**CLI Arguments:**

```bash
claude-proxy [options]

Options:
  -p, --port <number>          Port for HTTP server (default: 3100)
  -d, --directory <path>       Working directory for claude CLI (default: cwd)
  -c, --claude-path <path>     Path to claude CLI binary (default: 'claude')
  --host <string>              Host to bind to (default: 'localhost')
  --log-level <level>          Logging level (default: 'info')
  --max-sessions <number>      Max concurrent sessions (default: 1)
  --timeout <seconds>          Request timeout (default: 300)
```

**Example Implementation:**

```typescript
import { Command } from "commander";
import { startServer } from "./server";
import { logger } from "./utils/logger";

const program = new Command();

program
  .name("claude-proxy")
  .description("Proxy Claude Code CLI through HTTP API")
  .option("-p, --port <number>", "Port number", "3100")
  .option("-d, --directory <path>", "Working directory", process.cwd())
  .option("-c, --claude-path <path>", "Claude CLI path", "claude")
  .option("--host <string>", "Host to bind", "localhost")
  .option("--log-level <level>", "Log level", "info")
  .parse();

const options = program.opts();

startServer(options)
  .then(() => logger.info("Server started successfully"))
  .catch((err) => {
    logger.error("Failed to start server", err);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
```

#### 2. HTTP Server (`src/server.ts`)

**Endpoints:**

```typescript
// POST /chat - Send message to Claude, returns SSE stream
app.post("/chat", async (req, res) => {
  // Validate request body
  // Get or create session
  // Setup SSE connection
  // Send message to Claude CLI
  // Stream responses
});

// GET /status - Health check
app.get("/status", (req, res) => {
  res.json({
    status: "ok",
    sessions: sessionManager.getActiveSessions(),
    uptime: process.uptime(),
  });
});

// POST /reset - Reset conversation
app.post("/reset", async (req, res) => {
  // Kill and respawn Claude CLI process
  // Clear session state
});

// GET /sessions/:id/events - SSE endpoint (alternative design)
app.get("/sessions/:id/events", (req, res) => {
  // Setup SSE stream for specific session
});
```

**Middleware:**

```typescript
// CORS for cross-origin requests
app.use(cors());

// Request logging
app.use(morgan("combined"));

// Body parsing
app.use(express.json());

// Error handling
app.use(errorHandler);
```

#### 3. Claude CLI Manager (`src/managers/claude-manager.ts`)

**Core Functionality:**

```typescript
export class ClaudeManager {
  private process: ChildProcess | null = null;
  private pty: IPty | null = null;
  private outputBuffer: string = "";

  constructor(
    private config: {
      claudePath: string;
      workingDirectory: string;
      args?: string[];
    }
  ) {}

  async start(): Promise<void> {
    // Research: Does claude CLI have --no-tui or --json flag?
    // Option 1: Use child_process.spawn with stdio
    // Option 2: Use node-pty for full TTY emulation

    // Try non-interactive mode first
    this.process = spawn(
      this.config.claudePath,
      [
        "--no-tui", // if available
        "--json", // if available
        ...(this.config.args || []),
      ],
      {
        cwd: this.config.workingDirectory,
        env: {
          ...process.env,
          CLAUDE_NO_COLOR: "1", // Disable colors if possible
          CLAUDE_OUTPUT_FORMAT: "json", // If supported
        },
      }
    );

    // Setup output streaming
    this.process.stdout?.on("data", (data) => {
      this.handleOutput(data.toString());
    });

    this.process.stderr?.on("data", (data) => {
      this.handleError(data.toString());
    });

    this.process.on("exit", (code) => {
      this.handleExit(code);
    });
  }

  sendMessage(message: string): void {
    if (!this.process?.stdin) {
      throw new Error("Claude process not started");
    }

    // Send message to claude CLI stdin
    this.process.stdin.write(message + "\n");
  }

  private handleOutput(data: string): void {
    this.outputBuffer += data;

    // Parse output and emit events
    const events = this.parser.parse(this.outputBuffer);
    events.forEach((event) => {
      this.emit("event", event);
    });
  }

  async stop(): Promise<void> {
    // Gracefully stop claude process
    this.process?.kill("SIGTERM");

    // Wait for exit or force kill after timeout
    await this.waitForExit(5000);
  }
}
```

**Alternative PTY Approach:**

```typescript
import { spawn as ptySpawn } from "node-pty";

// If claude CLI doesn't support non-interactive mode
this.pty = ptySpawn(this.config.claudePath, [], {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: this.config.workingDirectory,
  env: process.env,
});

this.pty.onData((data) => {
  this.handleOutput(data);
});
```

#### 4. Output Parser (`src/parsers/output-parser.ts`)

**Challenge:** Parse Claude CLI output which may include:

- ANSI escape codes (colors, cursor movement)
- Interactive TUI elements
- Thinking blocks
- Tool calls and results
- Status messages

**Strategy:**

1. **Strip ANSI codes** first using `strip-ansi`
2. **Identify output patterns** - Research claude CLI output format
3. **Extract structured data** - Use regex or line-by-line parsing

**Expected Output Patterns (to be verified):**

```
# Thinking block
<thinking>
...reasoning...
</thinking>

# Tool use
<tool_use>
<name>Read</name>
<parameters>...</parameters>
</tool_use>

# Tool result
<tool_result>
...content...
</tool_result>

# Message
Assistant: Here's the response...
```

**Parser Implementation:**

```typescript
import stripAnsi from "strip-ansi";
import { ClaudeEvent, EventType } from "../types/events";

export class OutputParser {
  private buffer: string = "";

  parse(rawOutput: string): ClaudeEvent[] {
    const events: ClaudeEvent[] = [];
    const clean = stripAnsi(rawOutput);

    // Append to buffer
    this.buffer += clean;

    // Extract complete events
    while (true) {
      const event = this.extractNextEvent();
      if (!event) break;
      events.push(event);
    }

    return events;
  }

  private extractNextEvent(): ClaudeEvent | null {
    // Look for thinking blocks
    const thinkingMatch = this.buffer.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
      const content = thinkingMatch[1];
      this.buffer = this.buffer.slice(
        thinkingMatch.index! + thinkingMatch[0].length
      );
      return {
        type: "thinking",
        content: content.trim(),
        timestamp: Date.now(),
      };
    }

    // Look for tool use
    const toolUseMatch = this.buffer.match(
      /<tool_use>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<parameters>([\s\S]*?)<\/parameters>[\s\S]*?<\/tool_use>/
    );
    if (toolUseMatch) {
      const [fullMatch, name, params] = toolUseMatch;
      this.buffer = this.buffer.slice(toolUseMatch.index! + fullMatch.length);
      return {
        type: "tool_use",
        name,
        input: this.parseParams(params),
        timestamp: Date.now(),
      };
    }

    // Look for tool results
    const toolResultMatch = this.buffer.match(
      /<tool_result>([\s\S]*?)<\/tool_result>/
    );
    if (toolResultMatch) {
      const content = toolResultMatch[1];
      this.buffer = this.buffer.slice(
        toolResultMatch.index! + toolResultMatch[0].length
      );
      return {
        type: "tool_result",
        content: content.trim(),
        timestamp: Date.now(),
      };
    }

    // Look for assistant messages
    const messageMatch = this.buffer.match(/^Assistant: (.*?)(?=\n<|$)/s);
    if (messageMatch) {
      const content = messageMatch[1];
      this.buffer = this.buffer.slice(
        messageMatch.index! + messageMatch[0].length
      );
      return {
        type: "message",
        content: content.trim(),
        timestamp: Date.now(),
      };
    }

    return null;
  }

  private parseParams(paramsXml: string): any {
    // Parse parameter XML or JSON
    try {
      return JSON.parse(paramsXml);
    } catch {
      // Fallback to XML parsing
      return this.parseXml(paramsXml);
    }
  }
}
```

**Note:** The exact parsing strategy depends on claude CLI's actual output format. Research needed:

1. Run `claude --help` to check for flags
2. Run `claude` interactively and capture output
3. Check if there's a `--json` or `--machine-readable` flag
4. Test with sample prompts to understand output structure

#### 5. SSE Manager (`src/streaming/sse-manager.ts`)

**Responsibilities:**

- Manage SSE client connections
- Broadcast events to connected clients
- Handle client disconnections
- Support multiple concurrent clients

**Implementation:**

```typescript
import { Response } from "express";
import { ClaudeEvent } from "../types/events";

export class SSEManager {
  private clients: Map<string, Response> = new Map();

  addClient(clientId: string, res: Response): void {
    // Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Send initial connection event
    this.sendEvent(res, {
      type: "connected",
      data: { clientId },
    });

    this.clients.set(clientId, res);

    // Handle client disconnect
    res.on("close", () => {
      this.removeClient(clientId);
    });
  }

  broadcast(event: ClaudeEvent): void {
    this.clients.forEach((res) => {
      this.sendEvent(res, event);
    });
  }

  sendToClient(clientId: string, event: ClaudeEvent): void {
    const res = this.clients.get(clientId);
    if (res) {
      this.sendEvent(res, event);
    }
  }

  private sendEvent(res: Response, event: any): void {
    // SSE format: event: <type>\ndata: <json>\n\n
    const eventType = event.type || "message";
    const data = JSON.stringify(event);

    res.write(`event: ${eventType}\n`);
    res.write(`data: ${data}\n\n`);
  }

  removeClient(clientId: string): void {
    const res = this.clients.get(clientId);
    if (res) {
      res.end();
      this.clients.delete(clientId);
    }
  }

  closeAll(): void {
    this.clients.forEach((res) => res.end());
    this.clients.clear();
  }
}
```

### TypeScript Type Definitions

**API Types (`src/types/api.ts`):**

```typescript
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
```

**Event Types (`src/types/events.ts`):**

```typescript
export type EventType =
  | "connected"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "message"
  | "status"
  | "error"
  | "completed";

export interface BaseEvent {
  type: EventType;
  timestamp: number;
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

export type ClaudeEvent =
  | ThinkingEvent
  | ToolUseEvent
  | ToolResultEvent
  | MessageEvent
  | StatusEvent
  | ErrorEvent
  | CompletedEvent;
```

### Implementation Steps

#### Phase 1: Research & Setup

1. **Research Claude CLI**

   - Run `claude --help` to find available flags
   - Test claude CLI with sample prompts
   - Capture and analyze output format
   - Check for `--json`, `--no-tui`, or `--machine-readable` flags
   - Determine if PTY is needed or if stdio is sufficient

2. **Project Initialization**
   - Create new directory `claude-proxy/`
   - Initialize with `pnpm init`
   - Setup TypeScript configuration
   - Add dependencies:
     ```json
     {
       "dependencies": {
         "express": "^4.18.2",
         "commander": "^11.1.0",
         "strip-ansi": "^7.1.0",
         "node-pty": "^1.0.0",
         "uuid": "^9.0.1"
       },
       "devDependencies": {
         "@types/express": "^4.17.21",
         "@types/node": "^20.10.0",
         "tsx": "^4.7.0",
         "typescript": "^5.3.3",
         "vitest": "^1.0.4"
       }
     }
     ```

#### Phase 2: Core Components

3. **Implement CLI Entry Point**

   - Create `src/cli.ts`
   - Setup Commander.js for argument parsing
   - Add configuration validation
   - Implement graceful shutdown handlers

4. **Build Claude CLI Manager**

   - Create `src/managers/claude-manager.ts`
   - Implement process spawning (test both spawn and PTY approaches)
   - Setup stdin/stdout/stderr piping
   - Add process lifecycle management
   - Emit raw output events

5. **Develop Output Parser**
   - Create `src/parsers/output-parser.ts`
   - Implement ANSI code stripping
   - Build pattern matching for different event types
   - Add buffer management for incomplete events
   - Write unit tests with sample claude outputs

#### Phase 3: HTTP Server & Streaming

6. **Create HTTP Server**

   - Create `src/server.ts`
   - Setup Express with middleware
   - Implement `/status` endpoint
   - Add error handling middleware
   - Setup CORS configuration

7. **Implement SSE Manager**

   - Create `src/streaming/sse-manager.ts`
   - Setup SSE connection handling
   - Implement event broadcasting
   - Add client disconnect handling
   - Support multiple concurrent clients

8. **Integrate Components**
   - Connect ClaudeManager → OutputParser → SSEManager pipeline
   - Implement `/chat` endpoint
   - Handle message routing to claude CLI
   - Stream parsed events to SSE clients
   - Add error recovery

#### Phase 4: Session Management

9. **Add Session Support** (if needed)

   - Create `src/managers/session-manager.ts`
   - Support multiple concurrent sessions
   - Implement session cleanup
   - Add session timeout handling

10. **Implement Reset Functionality**
    - Add `/reset` endpoint
    - Kill and respawn claude CLI process
    - Clear session state
    - Notify connected clients

#### Phase 5: Testing

11. **Unit Tests**

    - Test output parser with various inputs
    - Test SSE manager connection handling
    - Mock claude CLI for manager tests

12. **Integration Tests**

    - Test full pipeline with real claude CLI
    - Verify event streaming
    - Test error scenarios

13. **E2E Tests**
    - Test HTTP endpoints
    - Verify SSE streaming with real clients
    - Test session lifecycle

#### Phase 6: Documentation & Examples

14. **Create Usage Examples**

    - Basic Node.js client
    - cURL examples
    - JavaScript/TypeScript SDK
    - Sample VS Code extension integration

15. **Write Documentation**
    - README with installation and usage
    - API reference
    - Troubleshooting guide
    - Architecture diagrams

#### Phase 7: Polish & Deploy

16. **Add Observability**

    - Implement structured logging
    - Add health checks
    - Monitor memory usage
    - Track active sessions

17. **Security Hardening**

    - Add authentication (API keys)
    - Implement rate limiting
    - Validate all inputs
    - Sanitize file paths

18. **Package for Distribution**
    - Add `bin` entry to package.json
    - Create build script
    - Test global installation
    - Publish to npm (optional)

### API Specification

#### POST /chat

Send a message to Claude and receive streaming events.

**Request:**

```typescript
POST /chat
Content-Type: application/json

{
  "message": "Fix the TypeScript error in src/utils.ts",
  "sessionId": "optional-session-id"  // Auto-generated if not provided
}
```

**Response:**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: connected
data: {"type":"connected","clientId":"abc123","timestamp":1704067200000}

event: thinking
data: {"type":"thinking","content":"Let me analyze the TypeScript error...","timestamp":1704067201000}

event: tool_use
data: {"type":"tool_use","name":"Read","input":{"file_path":"src/utils.ts"},"timestamp":1704067202000}

event: tool_result
data: {"type":"tool_result","content":"function add(a, b) { return a + b; }","timestamp":1704067203000}

event: message
data: {"type":"message","content":"I found the issue. The parameters need type annotations.","timestamp":1704067204000}

event: tool_use
data: {"type":"tool_use","name":"Edit","input":{"file_path":"src/utils.ts","old_string":"function add(a, b)","new_string":"function add(a: number, b: number)"},"timestamp":1704067205000}

event: completed
data: {"type":"completed","timestamp":1704067206000}
```

#### GET /status

Health check endpoint.

**Request:**

```
GET /status
```

**Response:**

```json
{
  "status": "ok",
  "sessions": [
    {
      "id": "session-1",
      "startedAt": 1704067200000,
      "lastActivity": 1704067300000
    }
  ],
  "uptime": 3600
}
```

#### POST /reset

Reset conversation and restart Claude CLI.

**Request:**

```typescript
POST /reset
Content-Type: application/json

{
  "sessionId": "session-1"  // Optional, resets default session if not provided
}
```

**Response:**

```json
{
  "status": "reset",
  "sessionId": "session-1",
  "timestamp": 1704067400000
}
```

### Technical Challenges & Solutions

#### Challenge 1: Avoiding Interactive Mode Complexity

**Problem:** Claude CLI's default interactive mode has several challenges:
- Requires TTY/pseudo-terminal (node-pty dependency)
- Shows workspace trust dialogs
- Outputs warning messages when using `--dangerously-skip-permissions`
- Complex ANSI/TUI output parsing required
- Native module compilation issues with newer Node versions

**Solution: Use --print Mode with JSON Streaming**

```typescript
import { spawn } from "child_process";

// Spawn Claude in print mode with JSON output
const args = [
  "--print",
  "--output-format",
  "stream-json",
];

// Add --continue for session persistence
if (this.sessionId) {
  args.push("--continue");
}

const process = spawn(this.config.claudePath, args, {
  cwd: this.config.workingDirectory,
  stdio: ["pipe", "pipe", "pipe"],
});

// Send message to stdin
process.stdin.write(message);
process.stdin.end();

// Parse JSON streaming output
process.stdout.on("data", (data) => {
  this.parseJsonStream(data.toString());
});
```

**Benefits of --print Mode:**
- ✅ No TTY/pseudo-terminal needed (standard pipes work fine)
- ✅ Automatically bypasses workspace trust dialog
- ✅ No warning messages
- ✅ Structured JSON output (no ANSI parsing needed)
- ✅ Works with any Node version (no native modules)
- ✅ Conversation context via `--continue` flag

**Trade-offs:**
- New process spawned for each message (minimal overhead)
- Session management via `--continue` flag (handled automatically)

#### Challenge 2: Claude CLI Output Format

**Problem:** Claude CLI outputs complex TUI with ANSI codes, cursor movements, etc.

**Solution:** Parse ANSI output and strip codes for structured event extraction

```typescript
import stripAnsi from "strip-ansi";
const clean = stripAnsi(rawOutput);
// Extract events from cleaned output
```

**Note:** Claude CLI supports `--output-format stream-json` for JSON output, but we use interactive mode with PTY to maintain conversation context.

#### Challenge 3: Real-time Event Extraction

**Problem:** Events may arrive in partial chunks across multiple stdout writes.

**Solution:** Implement buffering and boundary detection:

```typescript
class OutputParser {
  private buffer = "";

  parse(chunk: string): Event[] {
    this.buffer += chunk;
    const events: Event[] = [];

    // Extract complete events
    while (this.hasCompleteEvent()) {
      events.push(this.extractNextEvent());
    }

    return events;
  }

  private hasCompleteEvent(): boolean {
    // Check for closing tags or boundaries
    return (
      this.buffer.includes("</thinking>") ||
      this.buffer.includes("</tool_use>") ||
      this.buffer.includes("\n\n")
    ); // Double newline = end
  }
}
```

#### Challenge 4: Process Lifecycle Management

**Problem:** Need to handle claude CLI crashes, hangs, or unexpected exits.

**Solutions:**

1. **Health Checks:** Ping claude CLI periodically
2. **Timeouts:** Kill process if no response after N seconds
3. **Auto-restart:** Respawn on unexpected exit
4. **Cleanup:** Ensure proper resource cleanup

```typescript
class ClaudeManager {
  private startTime: number;
  private lastActivity: number;
  private healthCheckInterval: NodeJS.Timer;

  async start(): Promise<void> {
    this.process = spawn('claude', ...);

    // Setup health check
    this.healthCheckInterval = setInterval(() => {
      if (Date.now() - this.lastActivity > 60000) {
        this.restart('Health check failed');
      }
    }, 10000);

    // Handle unexpected exit
    this.process.on('exit', (code) => {
      if (code !== 0) {
        logger.error('Claude process exited unexpectedly', { code });
        this.restart('Unexpected exit');
      }
    });
  }

  async restart(reason: string): Promise<void> {
    logger.warn('Restarting claude CLI', { reason });
    await this.stop();
    await this.start();
  }
}
```

#### Challenge 5: Bidirectional Communication

**Problem:** Need to send messages to claude CLI while streaming responses.

**Solution:** PTY handles this naturally - write to PTY to send messages, read from PTY for responses:

```typescript
sendMessage(message: string): void {
  if (!this.ptyProcess) {
    throw new Error('Claude process not started');
  }

  if (!this.isRunning) {
    throw new Error('Claude process is not running');
  }

  this.lastActivity = Date.now();

  // Write to PTY (simulates typing in terminal)
  this.ptyProcess.write(message + '\n');
}
```

**Note:** With PTY, bidirectional communication works seamlessly because it emulates a real terminal environment.

### Testing Strategy

#### Unit Tests

**Output Parser Tests:**

```typescript
describe("OutputParser", () => {
  it("should extract thinking blocks", () => {
    const parser = new OutputParser();
    const input = "<thinking>Analyzing the code...</thinking>";
    const events = parser.parse(input);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("thinking");
    expect(events[0].content).toBe("Analyzing the code...");
  });

  it("should handle partial events", () => {
    const parser = new OutputParser();
    const chunk1 = "<thinking>Start";
    const chunk2 = " of thinking</thinking>";

    expect(parser.parse(chunk1)).toHaveLength(0);
    expect(parser.parse(chunk2)).toHaveLength(1);
  });
});
```

**SSE Manager Tests:**

```typescript
describe("SSEManager", () => {
  it("should broadcast events to all clients", () => {
    const manager = new SSEManager();
    const mockRes1 = createMockResponse();
    const mockRes2 = createMockResponse();

    manager.addClient("client1", mockRes1);
    manager.addClient("client2", mockRes2);

    manager.broadcast({ type: "message", content: "test" });

    expect(mockRes1.write).toHaveBeenCalled();
    expect(mockRes2.write).toHaveBeenCalled();
  });
});
```

#### Integration Tests

**Claude Manager Integration:**

```typescript
describe("ClaudeManager Integration", () => {
  it("should spawn claude and receive output", async () => {
    const manager = new ClaudeManager({
      claudePath: "claude",
      workingDirectory: "/tmp/test-repo",
    });

    const events: ClaudeEvent[] = [];
    manager.on("event", (e) => events.push(e));

    await manager.start();
    manager.sendMessage("List files in the current directory");

    // Wait for response
    await waitFor(() => events.length > 0, { timeout: 5000 });

    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool_use", name: "Bash" })
    );
  });
});
```

#### E2E Tests

**Full HTTP API Test:**

```typescript
describe("API E2E", () => {
  let server: Server;

  beforeAll(async () => {
    server = await startServer({ port: 3101 });
  });

  afterAll(async () => {
    await server.close();
  });

  it("should handle chat request with SSE streaming", async () => {
    const events: any[] = [];

    // Make request with EventSource
    const eventSource = new EventSource("http://localhost:3101/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });

    eventSource.onmessage = (e) => {
      events.push(JSON.parse(e.data));
    };

    await waitFor(() => events.length > 0, { timeout: 10000 });

    expect(events[0].type).toBe("connected");
    expect(events).toContainEqual(expect.objectContaining({ type: "message" }));
  });
});
```

### Usage Examples

#### Starting the Server

**Global Installation:**

```bash
npm install -g claude-proxy
claude-proxy --port 3100 --directory ~/my-project
```

**Local Usage:**

```bash
git clone https://github.com/yourusername/claude-proxy
cd claude-proxy
pnpm install
pnpm build
pnpm start -- --port 3100 --directory ~/my-project
```

#### Client Examples

**Node.js Client:**

```typescript
import EventSource from "eventsource";

const eventSource = new EventSource("http://localhost:3100/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "Fix the bug in src/utils.ts",
  }),
});

eventSource.addEventListener("thinking", (e) => {
  const data = JSON.parse(e.data);
  console.log("Claude is thinking:", data.content);
});

eventSource.addEventListener("tool_use", (e) => {
  const data = JSON.parse(e.data);
  console.log("Tool call:", data.name, data.input);
});

eventSource.addEventListener("message", (e) => {
  const data = JSON.parse(e.data);
  console.log("Claude says:", data.content);
});

eventSource.addEventListener("completed", (e) => {
  console.log("Task completed!");
  eventSource.close();
});

eventSource.addEventListener("error", (e) => {
  console.error("Error:", e);
  eventSource.close();
});
```

**cURL Example:**

```bash
curl -N -X POST http://localhost:3100/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "List all TypeScript files"}' \
  --no-buffer
```

**Python Client:**

```python
import requests
import json

url = 'http://localhost:3100/chat'
data = {'message': 'Explain this function'}

response = requests.post(url, json=data, stream=True)

for line in response.iter_lines():
    if line:
        decoded = line.decode('utf-8')
        if decoded.startswith('data: '):
            event_data = json.loads(decoded[6:])
            print(f"{event_data['type']}: {event_data}")
```

**Browser/JavaScript:**

```html
<!DOCTYPE html>
<html>
  <body>
    <button onclick="chat()">Ask Claude</button>
    <div id="output"></div>

    <script>
      function chat() {
        const eventSource = new EventSource(
          "/chat?" +
            new URLSearchParams({
              message: "Hello Claude!",
            })
        );

        const output = document.getElementById("output");

        eventSource.addEventListener("message", (e) => {
          const data = JSON.parse(e.data);
          output.innerHTML += `<p><strong>${
            data.type
          }:</strong> ${JSON.stringify(data)}</p>`;
        });

        eventSource.addEventListener("completed", () => {
          eventSource.close();
        });
      }
    </script>
  </body>
</html>
```

### Deployment Considerations

#### Security

1. **Authentication:**
   - Add API key middleware
   - Implement JWT tokens for session-based auth
   - Rate limiting per API key

```typescript
app.use("/chat", (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!validateApiKey(apiKey)) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
});
```

2. **Input Validation:**

   - Sanitize all messages
   - Validate file paths
   - Limit message length

3. **CORS Configuration:**
   - Whitelist allowed origins
   - Restrict methods

#### Monitoring

1. **Logging:**

   - Structured JSON logs
   - Log levels (debug, info, warn, error)
   - Request/response logging

2. **Metrics:**

   - Active sessions count
   - Request latency
   - Error rates
   - Memory usage

3. **Health Checks:**
   - `/health` endpoint
   - Monitor claude CLI process health
   - Database/Redis connectivity checks

#### Scalability

1. **Multiple Workers:**

   - Use PM2 or cluster mode
   - Load balance across instances

2. **Session Affinity:**

   - Sticky sessions for multi-instance deployments
   - Redis for session storage

3. **Resource Limits:**
   - Max concurrent sessions
   - Memory limits per session
   - Request timeouts

#### Docker Deployment

**Dockerfile:**

```dockerfile
FROM node:20-alpine

# Install claude CLI
RUN npm install -g claude

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3100

CMD ["node", "dist/cli.js", "--port", "3100"]
```

**docker-compose.yml:**

```yaml
version: "3.8"

services:
  claude-proxy:
    build: .
    ports:
      - "3100:3100"
    volumes:
      - ./workspace:/workspace
    environment:
      - LOG_LEVEL=info
      - MAX_SESSIONS=5
    command: ["--directory", "/workspace"]
```

### Future Enhancements

1. **WebSocket Support:** Add WebSocket as alternative to SSE for bidirectional communication
2. **Session Persistence:** Save conversation history to disk/database
3. **Multi-project Support:** Handle multiple codebases simultaneously
4. **Plugin System:** Allow custom parsers and event handlers
5. **Claude API Fallback:** Use Anthropic API if claude CLI unavailable
6. **GUI Dashboard:** Web UI to monitor sessions and interact with Claude
7. **Batch Operations:** Support multiple prompts in a single request
8. **File Upload:** Allow uploading context files via API
9. **Output Caching:** Cache responses for identical prompts
10. **Analytics:** Track usage patterns, common prompts, success rates

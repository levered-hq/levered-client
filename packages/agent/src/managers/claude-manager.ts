import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { ClaudeManagerConfig } from "../types/config";
import { ClaudeEvent } from "../types/events";
import { logger } from "../utils/logger";

export class ClaudeManager extends EventEmitter {
  private currentProcess: ChildProcess | null = null;
  private sessionId: string | null = null;
  private isProcessing: boolean = false;
  private isStarted: boolean = false;
  private startTime: number = 0;
  private lastActivity: number = 0;

  constructor(private config: ClaudeManagerConfig) {
    super();
    logger.info("ClaudeManager initialized", {
      workingDirectory: config.workingDirectory,
      claudePath: config.claudePath,
    });
  }

  /**
   * Initialize the manager (no long-running process needed)
   */
  async start(): Promise<void> {
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.isStarted = true;

    logger.info("ClaudeManager started in print mode");

    // Send initial status
    this.emit("status", {
      type: "status",
      status: "started",
      details: "Claude CLI manager ready (print mode)",
      timestamp: Date.now(),
    });
  }

  /**
   * Send a message to Claude CLI using --print mode
   * @param message Message to send
   */
  sendMessage(message: string): void {
    if (this.isProcessing) {
      const error = "Claude is currently processing another message";
      logger.warn(error);
      throw new Error(error);
    }

    this.lastActivity = Date.now();
    this.isProcessing = true;

    // Build args for Claude CLI in print mode
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose", // Required for stream-json output format
      "--permission-mode",
      "bypassPermissions", // Bypass permission dialogs
      ...(this.config.args || []),
    ];

    // Add --continue flag if we have a session ID
    if (this.sessionId) {
      args.push("--continue", this.sessionId);
      logger.info("Using --continue with session ID", { sessionId: this.sessionId });
    } else {
      logger.info("No session ID - starting new conversation");
    }

    logger.info("Spawning Claude CLI process", {
      args,
      message: message.substring(0, 100) + "...",
    });

    // Spawn Claude process for this message
    this.currentProcess = spawn(this.config.claudePath, args, {
      cwd: this.config.workingDirectory,
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    // Handle stdout (JSON streaming)
    this.currentProcess.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdoutBuffer += chunk;

      // Forward to terminal for visibility
      process.stdout.write(chunk);

      // Parse JSON stream
      this.parseJsonStream(chunk);
    });

    // Handle stderr
    this.currentProcess.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderrBuffer += chunk;
      process.stderr.write(chunk);
    });

    // Handle process exit
    this.currentProcess.on("exit", (code, signal) => {
      this.isProcessing = false;

      logger.info("Claude process exited", { code, signal, stderr: stderrBuffer });

      if (code === 0) {
        this.emit("event", {
          type: "completed",
          timestamp: Date.now(),
        });
      } else {
        logger.error("Claude exited with non-zero code", {
          code,
          signal,
          stderr: stderrBuffer,
          stdout: stdoutBuffer,
        });
        this.emit("event", {
          type: "error",
          error: `Claude exited with code ${code}`,
          timestamp: Date.now(),
        });
      }
    });

    // Handle process errors
    this.currentProcess.on("error", (error) => {
      this.isProcessing = false;
      logger.error("Claude process error", {
        error: error.message,
        stack: error.stack,
      });
      this.emit("event", {
        type: "error",
        error: error.message,
        stack: error.stack,
        timestamp: Date.now(),
      });
    });

    // Send message to stdin
    if (this.currentProcess.stdin) {
      this.currentProcess.stdin.write(message);
      this.currentProcess.stdin.end();
      logger.debug("Message sent to Claude stdin");
    } else {
      logger.error("Claude process stdin not available");
    }
  }

  /**
   * Parse JSON streaming output from Claude
   * @param chunk Raw output chunk
   */
  private parseJsonStream(chunk: string): void {
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const data = JSON.parse(line);

        // Extract session ID if present (stream-json uses session_id)
        if (data.session_id || data.sessionId) {
          const newSessionId = data.session_id || data.sessionId;
          if (newSessionId !== this.sessionId) {
            logger.info("Session ID captured", {
              sessionId: newSessionId,
              previousSessionId: this.sessionId
            });
            this.sessionId = newSessionId;
          }
        }

        // Handle stream-json format: assistant/user messages with nested content
        if (data.type === "assistant" && data.message?.content) {
          // Process each content block in the message
          for (const contentBlock of data.message.content) {
            const event = this.contentBlockToEvent(contentBlock);
            if (event) {
              this.emit("event", event);
            }
          }
        } else if (data.type === "user" && data.message?.content) {
          // Process tool results from user messages
          for (const contentBlock of data.message.content) {
            if (contentBlock.type === "tool_result") {
              this.emit("event", {
                type: "tool_result",
                content: contentBlock.content || "",
                timestamp: Date.now(),
              });
            }
          }
        } else {
          // Fallback to old parsing for other formats
          const event = this.jsonToEvent(data);
          if (event) {
            this.emit("event", event);
          }
        }
      } catch (error) {
        // Not valid JSON, might be partial or non-JSON output
        // Just log and continue
        if (line.trim() && !line.startsWith("data:")) {
          console.debug("Non-JSON output:", line);
        }
      }
    }
  }

  /**
   * Convert a content block from stream-json format to ClaudeEvent
   * @param block Content block from message.content array
   */
  private contentBlockToEvent(block: any): ClaudeEvent | null {
    const timestamp = Date.now();

    // Handle thinking blocks
    if (block.type === "thinking") {
      return {
        type: "thinking",
        content: block.thinking || "",
        timestamp,
      };
    }

    // Handle text blocks (regular messages)
    if (block.type === "text") {
      return {
        type: "message",
        content: block.text || "",
        timestamp,
      };
    }

    // Handle tool use blocks
    if (block.type === "tool_use") {
      return {
        type: "tool_use",
        name: block.name || "",
        input: block.input || {},
        timestamp,
      };
    }

    return null;
  }

  /**
   * Convert JSON data to ClaudeEvent
   * @param data JSON data from Claude
   */
  private jsonToEvent(data: any): ClaudeEvent | null {
    const timestamp = Date.now();

    // Handle different event types from Claude's JSON output
    if (data.type === "thinking" || data.thinking) {
      return {
        type: "thinking",
        content: data.content || data.thinking || "",
        timestamp,
      };
    }

    if (data.type === "tool_use" || data.tool) {
      return {
        type: "tool_use",
        name: data.name || data.tool?.name || "",
        input: data.input || data.tool?.input || {},
        timestamp,
      };
    }

    if (data.type === "tool_result" || data.result) {
      return {
        type: "tool_result",
        content: data.content || data.result || "",
        timestamp,
      };
    }

    if (data.type === "message" || data.type === "content" || data.text) {
      return {
        type: "message",
        content: data.content || data.text || "",
        timestamp,
      };
    }

    if (data.type === "error") {
      return {
        type: "error",
        error: data.error || data.message || "",
        timestamp,
      };
    }

    // Also emit raw output for terminal display
    if (data.content || data.text) {
      return {
        type: "raw_output",
        content: data.content || data.text || "",
        ansi: false,
        timestamp,
      };
    }

    return null;
  }

  /**
   * Stop the current Claude process
   */
  async stop(): Promise<void> {
    if (!this.currentProcess) {
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill("SIGKILL");
        }
        this.isProcessing = false;
        resolve();
      }, 5000);

      this.currentProcess!.once("exit", () => {
        clearTimeout(timeout);
        this.isProcessing = false;
        resolve();
      });

      this.currentProcess!.kill("SIGTERM");
    });
  }

  /**
   * Reset conversation (clear session ID)
   */
  async restart(): Promise<void> {
    await this.stop();
    this.sessionId = null;
  }

  /**
   * Check if manager is ready to accept requests
   * In print mode, the manager is always alive after start() is called
   */
  isAlive(): boolean {
    return this.isStarted;
  }

  /**
   * Check if currently processing a message
   */
  isBusy(): boolean {
    return this.isProcessing;
  }

  /**
   * Get uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get time since last activity in milliseconds
   */
  getIdleTime(): number {
    return Date.now() - this.lastActivity;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}

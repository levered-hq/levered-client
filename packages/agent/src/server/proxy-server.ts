import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { Server } from "http";
import { ClaudeManager } from "../managers/claude-manager";
import { SSEManager } from "../streaming/sse-manager";
import { ListenConfig } from "../types/config";
import {
  ChatRequest,
  ChatResponse,
  StatusResponse,
  ResetRequest,
  ResetResponse,
} from "../types/api";
import { logger } from "../utils/logger";

export class ProxyServer {
  private app: Express;
  private server: Server | null = null;
  private claudeManager: ClaudeManager | null = null;
  private sseManager: SSEManager;
  private startTime: number = 0;

  constructor(private config: ListenConfig) {
    this.app = express();
    this.sseManager = new SSEManager();
    logger.info("ProxyServer initialized", { config });
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(
      cors({
        origin: "*", // Configure based on security requirements
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Accept"],
      })
    );

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.info(`HTTP Request: ${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        body: req.body,
      });
      next();
    });
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/status", this.handleStatus.bind(this));

    // Chat endpoint (SSE)
    this.app.post("/chat", this.handleChat.bind(this));

    // Reset endpoint
    this.app.post("/reset", this.handleReset.bind(this));

    // Error handling middleware
    this.app.use(
      (err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error("Server error:", err);
        res.status(500).json({
          error: "Internal server error",
          message: err.message,
        });
      }
    );
  }

  /**
   * Handle GET /status - Health check
   */
  private handleStatus(req: Request, res: Response): void {
    const response: StatusResponse = {
      status: "ok",
      sessions: [
        {
          id: "default",
          startedAt: this.startTime,
          lastActivity: this.claudeManager?.isAlive()
            ? Date.now() - (this.claudeManager?.getIdleTime() || 0)
            : this.startTime,
        },
      ],
      uptime: Date.now() - this.startTime,
    };

    res.json(response);
  }

  /**
   * Handle POST /chat - Send message and receive SSE stream
   */
  private async handleChat(req: Request, res: Response): Promise<void> {
    try {
      const { message }: ChatRequest = req.body;

      logger.info("Chat request received", { message: message?.substring(0, 100) });

      if (!message) {
        logger.warn("Chat request missing message");
        res.status(400).json({ error: "Message is required" });
        return;
      }

      // Ensure Claude manager is running
      logger.debug("Checking ClaudeManager state", {
        exists: !!this.claudeManager,
        isAlive: this.claudeManager?.isAlive(),
      });

      if (!this.claudeManager || !this.claudeManager.isAlive()) {
        logger.error("Claude CLI is not available", {
          managerExists: !!this.claudeManager,
          isAlive: this.claudeManager?.isAlive(),
        });
        res.status(503).json({
          error: "Claude CLI is not running",
          message: "The Claude CLI process is not available",
        });
        return;
      }

      // Generate client ID
      const clientId = uuidv4();
      logger.info("Setting up SSE connection", { clientId });

      // Setup SSE connection
      this.sseManager.addClient(clientId, res);

      // Send message to Claude
      try {
        logger.info("Sending message to Claude", { clientId });
        this.claudeManager.sendMessage(message);
      } catch (error) {
        logger.error("Failed to send message to Claude", {
          error: error instanceof Error ? error.message : "Unknown",
          clientId,
        });
        this.sseManager.sendToClient(clientId, {
          type: "error",
          error:
            error instanceof Error ? error.message : "Failed to send message",
          timestamp: Date.now(),
        });
        this.sseManager.removeClient(clientId);
      }
    } catch (error) {
      logger.error("Error in /chat handler", {
        error: error instanceof Error ? error.message : "Unknown",
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (!res.headersSent) {
        res.status(500).json({
          error: "Failed to process chat request",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  /**
   * Handle POST /reset - Reset conversation
   */
  private async handleReset(req: Request, res: Response): Promise<void> {
    try {
      if (!this.claudeManager) {
        res.status(400).json({ error: "Claude manager not initialized" });
        return;
      }

      // Restart Claude process
      await this.claudeManager.restart();

      const response: ResetResponse = {
        status: "reset",
        sessionId: "default",
        timestamp: Date.now(),
      };

      res.json(response);

      // Notify all connected clients
      this.sseManager.broadcast({
        type: "status",
        status: "reset",
        details: "Session has been reset",
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error in /reset:", error);
      res.status(500).json({
        error: "Failed to reset session",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Start the proxy server
   */
  async start(): Promise<void> {
    this.startTime = Date.now();

    logger.info("Starting proxy server", {
      port: this.config.port,
      host: this.config.host,
      workingDirectory: this.config.workingDirectory,
      claudePath: this.config.claudePath,
    });

    // Initialize Claude manager
    this.claudeManager = new ClaudeManager({
      claudePath: this.config.claudePath,
      workingDirectory: this.config.workingDirectory,
    });

    // Setup event listeners
    this.claudeManager.on("event", (event) => {
      logger.debug("Broadcasting event to clients", { eventType: event.type });
      // Broadcast all events to connected clients
      this.sseManager.broadcast(event);
    });

    this.claudeManager.on("error", (error) => {
      logger.error("Claude manager error event", { error });
      this.sseManager.broadcast({
        type: "error",
        error: error.message || "Unknown error",
        timestamp: Date.now(),
      });
    });

    // Start Claude CLI process
    await this.claudeManager.start();

    // Start HTTP server
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        const logPath = logger.getLogPath();
        logger.info("Proxy server started successfully");
        console.log(
          `Proxy server running at http://${this.config.host}:${this.config.port}`
        );
        console.log(`Working directory: ${this.config.workingDirectory}`);
        console.log(`Claude CLI path: ${this.config.claudePath}`);
        console.log(`Logs: ${logPath}`);
        resolve();
      });

      this.server.on("error", (error) => {
        logger.error("Server error", { error });
        reject(error);
      });
    });
  }

  /**
   * Stop the proxy server
   */
  async stop(): Promise<void> {
    // Close all SSE connections
    this.sseManager.closeAll();

    // Stop Claude manager
    if (this.claudeManager) {
      await this.claudeManager.stop();
    }

    // Close HTTP server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log("Proxy server stopped");
          resolve();
        });
      });
    }
  }
}

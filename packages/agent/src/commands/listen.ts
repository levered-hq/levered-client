import chalk from "chalk";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { ProxyServer } from "../server/proxy-server";
import { ListenConfig } from "../types/config";

interface ListenOptions {
  port?: string;
  host?: string;
  claudePath?: string;
  directory?: string;
  logLevel?: "debug" | "info" | "warn" | "error";
  maxSessions?: string;
  timeout?: string;
  detached?: boolean;
}

/**
 * Redirect stdout and stderr to the agent.log file
 * In detached mode, all output goes only to the log file (not to console)
 */
const redirectOutputToLog = (): void => {
  const logDir = path.join(process.cwd(), ".levered");
  const logFile = path.join(logDir, "agent.log");

  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Create write stream for log file
  const logStream = fs.createWriteStream(logFile, {
    flags: "a",
    autoClose: false,
  });

  // Helper to write to log file with timestamp
  const writeToLog = (message: string) => {
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ${message}\n`);
  };

  // Keep the stream open and handle process exit
  process.on("exit", () => {
    logStream.end();
  });

  // Override stdout and stderr to write only to log file
  process.stdout.write = (chunk: any, encoding?: any, callback?: any) => {
    const message = chunk.toString();
    writeToLog(message);
    if (callback) callback();
    return true;
  };

  process.stderr.write = (chunk: any, encoding?: any, callback?: any) => {
    const message = chunk.toString();
    writeToLog(message);
    if (callback) callback();
    return true;
  };

  // Override console methods to write only to log file
  console.log = (...args: any[]) => {
    const message = args.map((arg) => String(arg)).join(" ");
    writeToLog(message);
  };

  console.error = (...args: any[]) => {
    const message = args.map((arg) => String(arg)).join(" ");
    writeToLog(`[ERROR] ${message}`);
  };

  console.warn = (...args: any[]) => {
    const message = args.map((arg) => String(arg)).join(" ");
    writeToLog(`[WARN] ${message}`);
  };
};

/**
 * Spawn a detached child process to run the server in the background
 */
const runDetached = async (options: ListenOptions): Promise<void> => {
  const logFile = path.join(process.cwd(), ".levered", "agent.log");
  const logDir = path.dirname(logFile);

  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Build command arguments (excluding --detached to avoid recursion)
  const args = ["listen"];
  if (options.port) args.push("--port", options.port);
  if (options.host) args.push("--host", options.host);
  if (options.claudePath) args.push("--claude-path", options.claudePath);
  if (options.directory) args.push("--directory", options.directory);
  if (options.logLevel) args.push("--log-level", options.logLevel);
  if (options.maxSessions) args.push("--max-sessions", options.maxSessions);
  if (options.timeout) args.push("--timeout", options.timeout);

  // Get the path to the levered binary
  const leveredPath = process.argv[1];

  console.log(chalk.blue("Starting server in detached mode..."));
  console.log(chalk.gray(`Logs will be written to: ${logFile}`));

  // Open log file for writing (stdout and stderr)
  const logFd = fs.openSync(logFile, "a");

  // Spawn detached child process with stdout/stderr redirected to log file
  const child = spawn(process.execPath, [leveredPath, ...args], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      LEVERED_DETACHED: "1",
    },
  });

  // Close the file descriptor in the parent process
  // (the child process will keep its own copy)
  fs.closeSync(logFd);

  // Unref the child process so the parent can exit
  child.unref();

  // Give the child process a moment to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Check if the process is still running
  if (child.exitCode === null) {
    console.log(chalk.green("Server started successfully in detached mode!"));
    console.log(chalk.blue(`PID: ${child.pid}`));
    console.log(chalk.gray(`View logs with: tail -f ${logFile}`));
    process.exit(0);
  } else {
    console.error(
      chalk.red("Failed to start server in detached mode"),
      `Exit code: ${child.exitCode}`
    );
    process.exit(1);
  }
};

export const listenCommand = async (options: ListenOptions) => {
  // If detached mode is requested and we're not already in a detached child process
  if (options.detached && !process.env.LEVERED_DETACHED) {
    return runDetached(options);
  }

  // If we're in a detached child process, redirect all output to log file
  if (process.env.LEVERED_DETACHED) {
    redirectOutputToLog();
  }

  try {
    console.log(chalk.blue("Starting Claude Code Proxy Server..."));

    // Parse and validate configuration
    const config: ListenConfig = {
      port: parseInt(options.port || "3100", 10),
      host: options.host || "localhost",
      claudePath: options.claudePath || "claude",
      workingDirectory: options.directory || process.cwd(),
      logLevel: options.logLevel || "info",
      maxSessions: parseInt(options.maxSessions || "1", 10),
      timeout: parseInt(options.timeout || "300", 10),
    };

    // Validate port
    if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
      console.error(chalk.red("Error: Invalid port number"));
      process.exit(1);
    }

    // Create and start proxy server
    const server = new ProxyServer(config);

    // Setup graceful shutdown
    const shutdown = async () => {
      console.log(chalk.yellow("\nShutting down proxy server..."));
      await server.stop();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    // Start the server
    await server.start();

    console.log(chalk.green("\nProxy server started successfully!"));
    console.log(chalk.blue("\nEndpoints:"));
    console.log(
      `  POST http://${config.host}:${config.port}/chat - Send messages and receive SSE stream`
    );
    console.log(
      `  GET  http://${config.host}:${config.port}/status - Health check`
    );
    console.log(
      `  POST http://${config.host}:${config.port}/reset - Reset conversation`
    );
    console.log(
      chalk.gray(
        `\nClaude CLI output will be displayed below and streamed to API clients.\n`
      )
    );
  } catch (error) {
    console.error(
      chalk.red("Failed to start proxy server:"),
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
};

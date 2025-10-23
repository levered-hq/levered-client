import chalk from "chalk";
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
}

export const listenCommand = async (options: ListenOptions) => {
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

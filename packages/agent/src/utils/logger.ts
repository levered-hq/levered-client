import fs from "fs";
import path from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private logDir: string;
  private logFile: string;
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB
  private maxFiles: number = 5;

  constructor() {
    // Log to .levered directory in working directory
    this.logDir = path.join(process.cwd(), ".levered");
    this.logFile = path.join(this.logDir, "agent.log");
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      const stats = fs.statSync(this.logFile);
      if (stats.size < this.maxFileSize) {
        return;
      }

      // Rotate logs
      for (let i = this.maxFiles - 1; i > 0; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;

        if (fs.existsSync(oldFile)) {
          if (i === this.maxFiles - 1) {
            fs.unlinkSync(oldFile); // Delete oldest
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // Move current log to .1
      fs.renameSync(this.logFile, `${this.logFile}.1`);
    } catch (error) {
      console.error("Failed to rotate logs:", error);
    }
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
  }

  private write(level: LogLevel, message: string, meta?: any): void {
    try {
      this.rotateIfNeeded();
      const formatted = this.formatMessage(level, message, meta);

      // Write to file
      fs.appendFileSync(this.logFile, formatted);

      // Also write to console for visibility
      const consoleMessage = `[${level.toUpperCase()}] ${message}`;
      switch (level) {
        case "error":
          console.error(consoleMessage, meta || "");
          break;
        case "warn":
          console.warn(consoleMessage, meta || "");
          break;
        case "info":
          console.log(consoleMessage, meta || "");
          break;
        case "debug":
          if (process.env.DEBUG) {
            console.log(consoleMessage, meta || "");
          }
          break;
      }
    } catch (error) {
      console.error("Failed to write log:", error);
    }
  }

  debug(message: string, meta?: any): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: any): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: any): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: any): void {
    this.write("error", message, meta);
  }

  /**
   * Get the log file path
   */
  getLogPath(): string {
    return this.logFile;
  }
}

// Export singleton instance
export const logger = new Logger();

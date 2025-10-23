import { Response } from "express";
import { ClaudeEvent } from "../types/events";

export class SSEManager {
  private clients: Map<string, Response> = new Map();

  /**
   * Add a new SSE client connection
   * @param clientId Unique client identifier
   * @param res Express response object
   */
  addClient(clientId: string, res: Response): void {
    // Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Send initial connection event
    this.sendEvent(res, {
      type: "connected",
      clientId,
      timestamp: Date.now(),
    });

    this.clients.set(clientId, res);

    // Handle client disconnect
    res.on("close", () => {
      this.removeClient(clientId);
    });
  }

  /**
   * Broadcast an event to all connected clients
   * @param event Event to broadcast
   */
  broadcast(event: ClaudeEvent): void {
    this.clients.forEach((res, clientId) => {
      try {
        this.sendEvent(res, event);
      } catch (error) {
        console.error(`Error sending event to client ${clientId}:`, error);
        this.removeClient(clientId);
      }
    });
  }

  /**
   * Send an event to a specific client
   * @param clientId Client identifier
   * @param event Event to send
   */
  sendToClient(clientId: string, event: ClaudeEvent): void {
    const res = this.clients.get(clientId);
    if (res) {
      try {
        this.sendEvent(res, event);
      } catch (error) {
        console.error(`Error sending event to client ${clientId}:`, error);
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Send an event to a response stream
   * @param res Express response object
   * @param event Event to send
   */
  private sendEvent(res: Response, event: any): void {
    // SSE format: event: <type>\ndata: <json>\n\n
    const eventType = event.type || "message";
    const data = JSON.stringify(event);

    res.write(`event: ${eventType}\n`);
    res.write(`data: ${data}\n\n`);
  }

  /**
   * Remove a client connection
   * @param clientId Client identifier
   */
  removeClient(clientId: string): void {
    const res = this.clients.get(clientId);
    if (res) {
      try {
        res.end();
      } catch (error) {
        // Client already disconnected
      }
      this.clients.delete(clientId);
    }
  }

  /**
   * Close all client connections
   */
  closeAll(): void {
    this.clients.forEach((res, clientId) => {
      try {
        res.end();
      } catch (error) {
        // Client already disconnected
      }
    });
    this.clients.clear();
  }

  /**
   * Get the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all connected client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }
}

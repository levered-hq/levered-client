import stripAnsi from "strip-ansi";
import { ClaudeEvent } from "../types/events";

export class OutputParser {
  private buffer: string = "";
  private jsonBuffer: string = "";
  private isJsonMode: boolean = false;

  constructor(jsonMode: boolean = false) {
    this.isJsonMode = jsonMode;
  }

  /**
   * Parse raw output from Claude CLI and extract structured events
   * @param rawOutput Raw output chunk from Claude CLI
   * @returns Array of parsed events
   */
  parse(rawOutput: string): ClaudeEvent[] {
    const events: ClaudeEvent[] = [];

    if (this.isJsonMode) {
      // Parse JSON streaming mode
      events.push(...this.parseJsonStream(rawOutput));
    } else {
      // Parse text mode with ANSI codes
      events.push(...this.parseTextOutput(rawOutput));
    }

    // Always include raw output event for terminal display
    events.push({
      type: "raw_output",
      content: rawOutput,
      ansi: true,
      timestamp: Date.now(),
    });

    return events;
  }

  private parseJsonStream(chunk: string): ClaudeEvent[] {
    const events: ClaudeEvent[] = [];
    this.jsonBuffer += chunk;

    // Split by newlines to get individual JSON objects
    const lines = this.jsonBuffer.split("\n");

    // Keep the last incomplete line in buffer
    this.jsonBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const data = JSON.parse(line);
        const event = this.jsonToEvent(data);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        // Invalid JSON, skip this line
        console.error("Failed to parse JSON line:", error);
      }
    }

    return events;
  }

  private jsonToEvent(data: any): ClaudeEvent | null {
    const timestamp = Date.now();

    // Map JSON streaming format to our event types
    // This will depend on Claude's actual JSON streaming format
    if (data.type === "thinking") {
      return {
        type: "thinking",
        content: data.content || data.text || "",
        timestamp,
      };
    }

    if (data.type === "tool_use") {
      return {
        type: "tool_use",
        name: data.name || "",
        input: data.input || {},
        timestamp,
      };
    }

    if (data.type === "tool_result") {
      return {
        type: "tool_result",
        content: data.content || "",
        success: data.success,
        timestamp,
      };
    }

    if (data.type === "message" || data.type === "text") {
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
        stack: data.stack,
        timestamp,
      };
    }

    if (data.type === "complete" || data.type === "completed") {
      return {
        type: "completed",
        summary: data.summary,
        timestamp,
      };
    }

    return null;
  }

  private parseTextOutput(rawOutput: string): ClaudeEvent[] {
    const events: ClaudeEvent[] = [];
    const clean = stripAnsi(rawOutput);

    // Append to buffer
    this.buffer += clean;

    // Extract complete events using pattern matching
    while (true) {
      const event = this.extractNextEvent();
      if (!event) break;
      events.push(event);
    }

    return events;
  }

  private extractNextEvent(): ClaudeEvent | null {
    const timestamp = Date.now();

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
        timestamp,
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
        timestamp,
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
        timestamp,
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
        timestamp,
      };
    }

    return null;
  }

  private parseParams(paramsXml: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(paramsXml);
    } catch {
      // If not JSON, return as string
      return { raw: paramsXml.trim() };
    }
  }

  /**
   * Reset the parser state
   */
  reset(): void {
    this.buffer = "";
    this.jsonBuffer = "";
  }
}

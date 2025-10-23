# Claude Code Chat Interface

A simple web-based chat interface for the Claude Code Proxy Server.

## Features

- Real-time streaming responses via Server-Sent Events (SSE)
- Visual indicators for different event types:
  - 💭 Thinking blocks
  - 🔧 Tool usage
  - 📋 Tool results
  - ❌ Errors
- Dark theme with syntax highlighting
- Auto-scrolling chat container
- Typing indicators
- Connection status indicator

## Prerequisites

Make sure the Claude Code Proxy Server is running:

```bash
cd ../agent
npm run build
levered listen --port 3100
```

## Installation

```bash
npm install
```

## Usage

Start the chat interface server:

```bash
npm start
```

The chat interface will be available at: `http://localhost:3200`

## Configuration

You can configure the proxy URL directly in the web interface. The default is `http://localhost:3100`.

## How It Works

1. The chat interface sends POST requests to the proxy server's `/chat` endpoint
2. The proxy server returns a Server-Sent Events (SSE) stream
3. Events are displayed in real-time in the chat interface
4. Different event types are rendered with different styles

## Event Types

- **connected**: Initial connection established
- **thinking**: Claude's reasoning process
- **tool_use**: When Claude calls a tool
- **tool_result**: Results from tool execution
- **message**: Text responses from Claude
- **status**: Status updates
- **error**: Error messages
- **completed**: Task completion
- **raw_output**: Raw terminal output (not displayed in UI)

## Development

To modify the chat interface, edit `public/index.html`. The interface is a single-page application with embedded CSS and JavaScript.

## Architecture

```
┌─────────────────┐
│  Browser        │
│  (Chat UI)      │
└────────┬────────┘
         │ HTTP/SSE
         ▼
┌─────────────────┐
│  Express Server │
│  (Static Files) │
└─────────────────┘

         │ HTTP/SSE
         ▼
┌─────────────────┐
│  Proxy Server   │
│  (port 3100)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Claude CLI     │
└─────────────────┘
```

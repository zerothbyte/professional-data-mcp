#!/usr/bin/env node
import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";

// Import tool definitions and handlers
import { yahooFinanceToolDefs, handleYahooFinance } from "./tools/yahoo-finance.js";
import { worldBankToolDefs, handleWorldBank } from "./tools/world-bank.js";
import { openAlexToolDefs, handleOpenAlex } from "./tools/openalex.js";
import { semanticScholarToolDefs, handleSemanticScholar } from "./tools/semantic-scholar.js";
import { crossrefToolDefs, handleCrossref } from "./tools/crossref.js";
import { utilityToolDefs, handleUtilities } from "./tools/utilities.js";

// ── All tools registry ───────────────────────────────────────────────────────

const ALL_TOOLS = [
  ...yahooFinanceToolDefs,
  ...worldBankToolDefs,
  ...openAlexToolDefs,
  ...semanticScholarToolDefs,
  ...crossrefToolDefs,
  ...utilityToolDefs,
];

// Tool name → handler routing
async function routeTool(toolName: string, args: Record<string, any>): Promise<string> {
  if (toolName.startsWith("finance_")) return handleYahooFinance(toolName, args);
  if (toolName.startsWith("worldbank_")) return handleWorldBank(toolName, args);
  if (toolName.startsWith("academic_")) return handleOpenAlex(toolName, args);
  if (toolName.startsWith("scholar_")) return handleSemanticScholar(toolName, args);
  if (toolName.startsWith("crossref_")) return handleCrossref(toolName, args);
  if (toolName.startsWith("utilities_")) return handleUtilities(toolName, args);
  throw new Error(`Unknown tool: ${toolName}`);
}

// ── MCP Server Factory ───────────────────────────────────────────────────────

function createMcpServer() {
  const server = new Server(
    {
      name: "professional-data-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: ALL_TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await routeTool(name, (args ?? {}) as Record<string, any>);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error: any) {
      const message = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message ?? String(error);

      return {
        content: [
          {
            type: "text",
            text: `❌ Error calling "${name}": ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// ── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3000", 10);

// Session storage
interface Session {
  transport: StreamableHTTPServerTransport | SSEServerTransport;
  server: Server;
}
const streamableSessions = new Map<string, Session>();
const sseSessions = new Map<string, Session>();

// Health check
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "Professional Data MCP Server is running.",
    toolsCount: ALL_TOOLS.length,
    activeSessions: {
      streamable: streamableSessions.size,
      sse: sseSessions.size,
    }
  });
});

// Streamable HTTP (modern)
app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && streamableSessions.has(sessionId)) {
    const session = streamableSessions.get(sessionId)!;
    await (session.transport as StreamableHTTPServerTransport).handleRequest(req, res, req.body);
    return;
  }

  if (!isInitializeRequest(req.body)) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "No valid session. Send initialize request first." },
      id: req.body?.id ?? null,
    });
    return;
  }

  const newSessionId = randomUUID();
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => newSessionId,
    onsessioninitialized: (id) => {
      streamableSessions.set(id, { transport, server });
    },
  });

  transport.onclose = () => {
    streamableSessions.delete(newSessionId);
  };

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !streamableSessions.has(sessionId)) {
    res.status(400).json({ error: "Invalid session" });
    return;
  }
  res.setHeader("X-Accel-Buffering", "no");
  const session = streamableSessions.get(sessionId)!;
  await (session.transport as StreamableHTTPServerTransport).handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !streamableSessions.has(sessionId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const session = streamableSessions.get(sessionId)!;
  await (session.transport as StreamableHTTPServerTransport).handleRequest(req, res);
  streamableSessions.delete(sessionId);
  await session.server.close();
});

// Legacy SSE
app.get("/sse", async (req, res) => {
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");

  const server = createMcpServer();
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const messagesUrl = `${protocol}://${host}/messages`;

  const transport = new SSEServerTransport(messagesUrl, res);
  sseSessions.set(transport.sessionId, { transport, server });

  res.on("close", () => {
    sseSessions.delete(transport.sessionId);
    server.close().catch(() => {});
  });

  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId || !sseSessions.has(sessionId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const session = sseSessions.get(sessionId)!;
  await (session.transport as SSEServerTransport).handlePostMessage(req, res, req.body);
});

// Check if running in stdio mode (e.g. local debug)
if (process.env.MCP_TRANSPORT === "stdio") {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  server.connect(transport).then(() => {
    console.error("Professional Data MCP running in stdio mode");
  });
} else {
  app.listen(PORT, "0.0.0.0", () => {
    console.error(`Professional Data MCP Server listening on http://0.0.0.0:${PORT}`);
  });
}

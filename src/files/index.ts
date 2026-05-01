import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { searchArxiv, getPaperById, listCategories } from "./arxiv.js";

const app = express();
app.use(express.json());

// Store active transports per session
const transports = new Map<string, SSEServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "arxiv-mcp",
    version: "1.0.0",
  });

  // ── Tool: search_papers ───────────────────────────────────────────────────
  server.tool(
    "search_papers",
    "Search for academic papers on arXiv by keywords, author, or category",
    {
      query: z.string().describe("Search query (keywords, title, author, etc.)"),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Number of results to return (1-50)"),
      sort_by: z
        .enum(["relevance", "lastUpdatedDate", "submittedDate"])
        .default("relevance")
        .describe("Sort order"),
      category: z
        .string()
        .optional()
        .describe("arXiv category filter, e.g. cs.AI, math.AP, physics.hep-th"),
    },
    async ({ query, max_results, sort_by, category }) => {
      try {
        const results = await searchArxiv({ query, max_results, sort_by, category });
        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No papers found for your query." }],
          };
        }
        const formatted = results
          .map(
            (p, i) =>
              `## ${i + 1}. ${p.title}\n` +
              `**ID:** ${p.id}\n` +
              `**Authors:** ${p.authors.join(", ")}\n` +
              `**Published:** ${p.published}\n` +
              `**Category:** ${p.category}\n` +
              `**Abstract:** ${p.abstract.slice(0, 400)}${p.abstract.length > 400 ? "…" : ""}\n` +
              `**Links:** [PDF](${p.pdfUrl}) | [Abstract](${p.abstractUrl})\n`
          )
          .join("\n---\n\n");
        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} paper(s) for "${query}":\n\n${formatted}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error searching arXiv: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: get_paper ───────────────────────────────────────────────────────
  server.tool(
    "get_paper",
    "Get full details for a specific arXiv paper by its ID",
    {
      paper_id: z
        .string()
        .describe("arXiv paper ID, e.g. '2301.07041' or 'cs.AI/0601001'"),
    },
    async ({ paper_id }) => {
      try {
        const paper = await getPaperById(paper_id);
        const text =
          `# ${paper.title}\n\n` +
          `**arXiv ID:** ${paper.id}\n` +
          `**Authors:** ${paper.authors.join(", ")}\n` +
          `**Published:** ${paper.published}\n` +
          `**Updated:** ${paper.updated}\n` +
          `**Primary Category:** ${paper.category}\n` +
          `**All Categories:** ${paper.allCategories.join(", ")}\n\n` +
          `## Abstract\n${paper.abstract}\n\n` +
          `## Links\n` +
          `- [PDF](${paper.pdfUrl})\n` +
          `- [Abstract page](${paper.abstractUrl})\n` +
          (paper.doi ? `- [DOI](https://doi.org/${paper.doi})\n` : "") +
          (paper.journalRef ? `\n**Journal:** ${paper.journalRef}\n` : "");
        return { content: [{ type: "text", text }] };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error fetching paper ${paper_id}: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: list_categories ─────────────────────────────────────────────────
  server.tool(
    "list_categories",
    "List available arXiv subject categories",
    {},
    async () => {
      const cats = listCategories();
      const text = Object.entries(cats)
        .map(([group, items]) => `**${group}**\n${items.map((c) => `  - \`${c.id}\` ${c.name}`).join("\n")}`)
        .join("\n\n");
      return { content: [{ type: "text", text: `## arXiv Categories\n\n${text}` }] };
    }
  );

  return server;
}

// ── SSE endpoint ──────────────────────────────────────────────────────────────
app.get("/arxiv", async (req: Request, res: Response) => {
  console.log(`[SSE] New connection from ${req.ip}`);

  // CORS headers — required for Claude.ai and other web clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-cache");

  const transport = new SSEServerTransport("/arxiv/message", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

  res.on("close", () => {
    console.log(`[SSE] Connection closed: ${sessionId}`);
    transports.delete(sessionId);
  });

  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);
  console.log(`[SSE] Session started: ${sessionId}`);
});

// ── POST message endpoint ─────────────────────────────────────────────────────
app.post("/arxiv/message", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

// ── OPTIONS preflight ─────────────────────────────────────────────────────────
app.options("*", (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.sendStatus(200);
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "arXiv MCP Server",
    version: "1.0.0",
    endpoints: { sse: "/arxiv", message: "/arxiv/message" },
    tools: ["search_papers", "get_paper", "list_categories"],
    active_sessions: transports.size,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`arXiv MCP Server running on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/arxiv`);
});

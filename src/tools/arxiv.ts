import { XMLParser } from "fast-xml-parser";

const ARXIV_API = "https://export.arxiv.org/api/query";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["entry", "author", "category", "link"].includes(name),
});

// ── Tool Definitions ────────────────────────────────────────────────────────

export const arxivToolDefs = [
  {
    name: "arxiv_search_papers",
    description:
      "Search for academic papers on arXiv. You can filter by category (e.g., cs.AI, physics.gen-ph) and sort results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or keywords" },
        limit: { type: "number", description: "Max results (default 5, max 50)", default: 5 },
        category: { 
          type: "string", 
          description: "Optional arXiv category (e.g., cs.LG, cs.AI, math.CO). Use arxiv_list_categories to see all." 
        },
        sort_by: {
          type: "string",
          enum: ["relevance", "lastUpdatedDate", "submittedDate"],
          default: "relevance",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "arxiv_get_paper",
    description: "Get full details of a single paper by its arXiv ID (e.g., '2301.07041').",
    inputSchema: {
      type: "object",
      properties: {
        paper_id: { type: "string", description: "The arXiv ID" },
      },
      required: ["paper_id"],
    },
  },
  {
    name: "arxiv_list_categories",
    description: "Returns a list of common arXiv categories and their descriptions.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ── Handlers ────────────────────────────────────────────────────────────────

export async function handleArxiv(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "arxiv_search_papers":
      const papers = await searchArxiv({
        query: args.query,
        max_results: args.limit ?? 5,
        category: args.category,
        sort_by: (args.sort_by as any) ?? "relevance",
      });
      return JSON.stringify(papers, null, 2);
    case "arxiv_get_paper":
      const paper = await getPaperById(args.paper_id);
      return JSON.stringify(paper, null, 2);
    case "arxiv_list_categories":
      return JSON.stringify(listCategories(), null, 2);
    default:
      throw new Error(`Unknown arXiv tool: ${toolName}`);
  }
}

// ── Internal Logic ──────────────────────────────────────────────────────────

let lastRequest = 0;
async function rateLimitedFetch(url: string): Promise<string> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < 340) await sleep(340 - elapsed);
  lastRequest = Date.now();

  const res = await fetch(url, {
    headers: { "User-Agent": "professional-data-mcp/1.0 (mcp@example.com)" },
  });

  if (!res.ok) throw new Error(`arXiv API error: ${res.status} ${res.statusText}`);
  return res.text();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseEntry(entry: any) {
  const rawId: string = entry["id"] ?? "";
  const id = rawId.replace("http://arxiv.org/abs/", "").replace("https://arxiv.org/abs/", "");

  const authors: string[] = Array.isArray(entry["author"])
    ? entry["author"].map((a: any) => a["name"] ?? "")
    : entry["author"]
    ? [entry["author"]["name"] ?? ""]
    : [];

  const links: any[] = Array.isArray(entry["link"]) ? entry["link"] : entry["link"] ? [entry["link"]] : [];
  const pdfUrl = links.find((l) => l["@_type"] === "application/pdf")?.["@_href"] ?? `https://arxiv.org/pdf/${id}`;

  const categories: any[] = Array.isArray(entry["category"])
    ? entry["category"]
    : entry["category"]
    ? [entry["category"]]
    : [];
  const allCategories = categories.map((c: any) => c["@_term"] ?? "");

  return {
    id,
    title: (entry["title"] ?? "").replace(/\s+/g, " ").trim(),
    authors,
    abstract: (entry["summary"] ?? "").replace(/\s+/g, " ").trim(),
    published: (entry["published"] ?? "").slice(0, 10),
    updated: (entry["updated"] ?? "").slice(0, 10),
    primaryCategory: entry["arxiv:primary_category"]?.["@_term"] ?? allCategories[0] ?? "",
    allCategories,
    pdfUrl,
    doi: entry["arxiv:doi"] ?? undefined,
  };
}

async function searchArxiv(opts: {
  query: string;
  max_results: number;
  sort_by: "relevance" | "lastUpdatedDate" | "submittedDate";
  category?: string;
}) {
  let searchQuery = opts.query;
  if (opts.category) {
    searchQuery = `cat:${opts.category} AND (${opts.query})`;
  }

  const params = new URLSearchParams({
    search_query: `all:${searchQuery}`,
    start: "0",
    max_results: String(opts.max_results),
    sortBy: opts.sort_by,
    sortOrder: "descending",
  });

  const xml = await rateLimitedFetch(`${ARXIV_API}?${params}`);
  const parsed = parser.parse(xml);
  const entries = parsed["feed"]?.["entry"];
  
  if (!entries) return [];
  const arr = Array.isArray(entries) ? entries : [entries];
  return arr.map(parseEntry);
}

async function getPaperById(paperId: string) {
  const cleanId = paperId.trim().replace(/v\d+$/, "");
  const params = new URLSearchParams({ id_list: cleanId });
  const xml = await rateLimitedFetch(`${ARXIV_API}?${params}`);
  const parsed = parser.parse(xml);
  const entry = parsed["feed"]?.["entry"];
  
  if (!entry) throw new Error(`Paper not found: ${paperId}`);
  const e = Array.isArray(entry) ? entry[0] : entry;
  return parseEntry(e);
}

function listCategories() {
  return {
    "Computer Science": [
      { id: "cs.AI", name: "Artificial Intelligence" },
      { id: "cs.CL", name: "Computation and Language (NLP)" },
      { id: "cs.CV", name: "Computer Vision" },
      { id: "cs.LG", name: "Machine Learning" },
      { id: "cs.RO", name: "Robotics" },
    ],
    "Physics & Math": [
      { id: "physics.gen-ph", name: "General Physics" },
      { id: "physics.quant-ph", name: "Quantum Physics" },
      { id: "math.ST", name: "Statistics Theory" },
      { id: "stat.ML", name: "Machine Learning (Stats)" },
    ],
  };
}

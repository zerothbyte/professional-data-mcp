import { XMLParser } from "fast-xml-parser";
// @ts-ignore
import pdf from "pdf-parse/lib/pdf-parse.js";

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
    description: `Search for papers on arXiv. 
IMPORTANT - DEFAULT BEHAVIOR WARNING: ArXiv treats space-separated words as OR by default, returning papers matching ANY word. This often returns thousands of irrelevant results. Use field prefixes (especially ti:) for precise searches. 

SEARCH STRATEGY (in order of precision):
1. Start with ti: (title) searches - fastest and most relevant results
2. Add cat: (category) to filter by field - use list_categories tool first!
3. Use au: (author) when you know specific researchers
4. Combine multiple terms with AND for best results
5. Avoid plain keyword searches without field prefixes

QUERY OPERATORS:
- ti:"text" - Search in title only (RECOMMENDED FOR PRECISION)
- abs:"text" - Search in abstract
- au:"name" - Search by author
- cat:CODE - Filter by category (e.g., cat:cs.AI, cat:quant-ph)
- Combine with: AND, OR, ANDNOT

EXAMPLES:
- ti:"neural networks" AND cat:cs.AI
- ti:"deep learning" AND au:bengio

DATE FILTERING: Filter papers by submission date using date_from and/or date_to parameters (YYYY-MM-DD).`,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string (use field prefixes like ti: for precision)." },
        max_results: { type: "number", description: "Maximum results (1-100, default 10).", default: 10 },
        sort_by: {
          type: "string",
          enum: ["submittedDate", "lastUpdatedDate", "relevance"],
          default: "relevance",
        },
        sort_order: {
          type: "string",
          enum: ["descending", "ascending"],
          default: "descending",
        },
        date_from: { type: "string", description: "Filter papers submitted on or after this date (YYYY-MM-DD)." },
        date_to: { type: "string", description: "Filter papers submitted on or before this date (YYYY-MM-DD)." },
      },
      required: ["query"],
    },
  },
  {
    name: "arxiv_get_paper_data",
    description: "Get detailed information about a specific paper including abstract and available formats.",
    inputSchema: {
      type: "object",
      properties: {
        paper_id: { type: "string", description: "The arXiv ID (e.g., '2301.07041')" },
      },
      required: ["paper_id"],
    },
  },
  {
    name: "arxiv_get_full_paper_text",
    description: "Downloads and converts the paper PDF to text. Important: Papers can be very large and may overwhelm context windows. Use get_paper_data first.",
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
    description: "List all available arXiv categories for use with cat: filter in search_papers. CALL THIS FIRST before using cat: in search queries.",
    inputSchema: {
      type: "object",
      properties: {
        primary_category: { type: "string", description: "Optional filter (e.g., 'cs', 'physics', 'math')" },
      },
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
      return JSON.stringify(await searchArxiv(args), null, 2);
    case "arxiv_get_paper_data":
      return JSON.stringify(await getPaperById(args.paper_id), null, 2);
    case "arxiv_get_full_paper_text":
      return getFullPaperText(args.paper_id);
    case "arxiv_list_categories":
      return JSON.stringify(listCategories(args.primary_category), null, 2);
    default:
      throw new Error(`Unknown arXiv tool: ${toolName}`);
  }
}

// ── Internal Logic ──────────────────────────────────────────────────────────

let lastRequest = 0;
async function rateLimitedFetch(url: string, isBinary = false): Promise<any> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < 340) await sleep(340 - elapsed);
  lastRequest = Date.now();

  const res = await fetch(url, {
    headers: { "User-Agent": "professional-data-mcp/1.1 (mcp@example.com)" },
  });

  if (!res.ok) throw new Error(`arXiv API error: ${res.status} ${res.statusText}`);
  return isBinary ? res.arrayBuffer() : res.text();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseEntry(entry: any) {
  const rawId: string = entry["id"] ?? "";
  const id = rawId.replace(/https?:\/\/arxiv.org\/abs\//, "");
  const links: any[] = Array.isArray(entry["link"]) ? entry["link"] : entry["link"] ? [entry["link"]] : [];
  const pdfUrl = links.find((l) => l["@_type"] === "application/pdf")?.["@_href"] ?? `https://arxiv.org/pdf/${id}`;

  return {
    id,
    title: (entry["title"] ?? "").replace(/\s+/g, " ").trim(),
    authors: (Array.isArray(entry["author"]) ? entry["author"] : [entry["author"]]).map((a: any) => a?.name),
    abstract: (entry["summary"] ?? "").replace(/\s+/g, " ").trim(),
    published: entry["published"],
    updated: entry["updated"],
    categories: (Array.isArray(entry["category"]) ? entry["category"] : [entry["category"]]).map((c: any) => c?.["@_term"]),
    pdfUrl,
    doi: entry["arxiv:doi"]?.[0] ?? entry["arxiv:doi"],
  };
}

async function searchArxiv(args: any) {
  let query = args.query;

  // Add date filtering to query if provided
  if (args.date_from || args.date_to) {
    const from = args.date_from ? args.date_from.replace(/-/g, "") + "0000" : "000001010000";
    const to = args.date_to ? args.date_to.replace(/-/g, "") + "2359" : "999912312359";
    query = `(${query}) AND submittedDate:[${from} TO ${to}]`;
  }

  const params = new URLSearchParams({
    search_query: query,
    start: "0",
    max_results: String(args.max_results ?? 10),
    sortBy: args.sort_by === "relevance" ? "relevance" : args.sort_by === "submitted_date" ? "submittedDate" : args.sort_by,
    sortOrder: args.sort_order ?? "descending",
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

async function getFullPaperText(paperId: string): Promise<string> {
  try {
    const cleanId = paperId.trim().replace(/v\d+$/, "");
    const pdfUrl = `https://arxiv.org/pdf/${cleanId}.pdf`;
    
    console.log(`Downloading PDF from ${pdfUrl}...`);
    const buffer = await rateLimitedFetch(pdfUrl, true);
    
    console.log(`Parsing PDF...`);
    const data = await pdf(Buffer.from(buffer));
    
    return `--- FULL TEXT FOR ARXIV:${paperId} ---\n\n${data.text}`;
  } catch (err: any) {
    return `❌ Failed to extract text from PDF: ${err.message}`;
  }
}

function listCategories(primaryFilter?: string) {
  const categories: Record<string, string> = {
    "cs.AI": "Artificial Intelligence",
    "cs.CL": "Computation and Language (NLP)",
    "cs.CV": "Computer Vision",
    "cs.LG": "Machine Learning",
    "cs.RO": "Robotics",
    "cs.NE": "Neural and Evolutionary Computing",
    "math.ST": "Statistics Theory",
    "stat.ML": "Machine Learning (Stats)",
    "physics.gen-ph": "General Physics",
    "quant-ph": "Quantum Physics",
    "econ.GN": "General Economics",
    "q-bio.NC": "Neurons and Cognition",
  };

  if (primaryFilter) {
    return Object.fromEntries(
      Object.entries(categories).filter(([id]) => id.startsWith(primaryFilter))
    );
  }
  return categories;
}

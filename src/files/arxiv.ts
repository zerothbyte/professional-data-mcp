import { XMLParser } from "fast-xml-parser";

const ARXIV_API = "https://export.arxiv.org/api/query";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["entry", "author", "category", "link"].includes(name),
});

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  updated: string;
  category: string;
  allCategories: string[];
  pdfUrl: string;
  abstractUrl: string;
  doi?: string;
  journalRef?: string;
}

interface SearchOptions {
  query: string;
  max_results: number;
  sort_by: "relevance" | "lastUpdatedDate" | "submittedDate";
  category?: string;
}

// ── Rate limiting: max 3 req/sec per arXiv guidelines ────────────────────────
let lastRequest = 0;
async function rateLimitedFetch(url: string): Promise<string> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < 340) await sleep(340 - elapsed);
  lastRequest = Date.now();

  const res = await fetch(url, {
    headers: { "User-Agent": "arxiv-mcp-server/1.0 (your-email@example.com)" },
  });

  if (!res.ok) throw new Error(`arXiv API error: ${res.status} ${res.statusText}`);
  return res.text();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Parse a single <entry> element into a Paper ───────────────────────────────
function parseEntry(entry: any): Paper {
  const rawId: string = entry["id"] ?? "";
  const id = rawId.replace("http://arxiv.org/abs/", "").replace("https://arxiv.org/abs/", "");

  const title: string = (entry["title"] ?? "").replace(/\s+/g, " ").trim();
  const abstract: string = (entry["summary"] ?? "").replace(/\s+/g, " ").trim();
  const published: string = (entry["published"] ?? "").slice(0, 10);
  const updated: string = (entry["updated"] ?? "").slice(0, 10);

  const authors: string[] = Array.isArray(entry["author"])
    ? entry["author"].map((a: any) => a["name"] ?? "")
    : entry["author"]
    ? [entry["author"]["name"] ?? ""]
    : [];

  const links: any[] = Array.isArray(entry["link"]) ? entry["link"] : entry["link"] ? [entry["link"]] : [];
  const pdfUrl = links.find((l) => l["@_type"] === "application/pdf")?.["@_href"] ?? `https://arxiv.org/pdf/${id}`;
  const abstractUrl = links.find((l) => l["@_type"] === "text/html")?.["@_href"] ?? `https://arxiv.org/abs/${id}`;

  const categories: any[] = Array.isArray(entry["category"])
    ? entry["category"]
    : entry["category"]
    ? [entry["category"]]
    : [];
  const allCategories = categories.map((c: any) => c["@_term"] ?? "");
  const primaryCat = entry["arxiv:primary_category"]?.["@_term"] ?? allCategories[0] ?? "";

  return {
    id,
    title,
    authors,
    abstract,
    published,
    updated,
    category: primaryCat,
    allCategories,
    pdfUrl,
    abstractUrl,
    doi: entry["arxiv:doi"] ?? undefined,
    journalRef: entry["arxiv:journal_ref"] ?? undefined,
  };
}

// ── Public: search papers ─────────────────────────────────────────────────────
export async function searchArxiv(opts: SearchOptions): Promise<Paper[]> {
  let searchQuery = opts.query;

  // If category filter provided, prepend it
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
  const feed = parsed["feed"];

  const entries = feed?.["entry"];
  if (!entries) return [];
  const arr = Array.isArray(entries) ? entries : [entries];

  return arr.map(parseEntry);
}

// ── Public: get single paper by ID ───────────────────────────────────────────
export async function getPaperById(paperId: string): Promise<Paper> {
  // Normalise ID: strip version suffix for cleaner lookup
  const cleanId = paperId.trim().replace(/v\d+$/, "");

  const params = new URLSearchParams({ id_list: cleanId });
  const xml = await rateLimitedFetch(`${ARXIV_API}?${params}`);
  const parsed = parser.parse(xml);
  const feed = parsed["feed"];

  const entry = feed?.["entry"];
  if (!entry) throw new Error(`Paper not found: ${paperId}`);

  const e = Array.isArray(entry) ? entry[0] : entry;
  return parseEntry(e);
}

// ── Public: list categories ───────────────────────────────────────────────────
export function listCategories() {
  return {
    "Computer Science": [
      { id: "cs.AI", name: "Artificial Intelligence" },
      { id: "cs.CL", name: "Computation and Language (NLP)" },
      { id: "cs.CV", name: "Computer Vision" },
      { id: "cs.LG", name: "Machine Learning" },
      { id: "cs.RO", name: "Robotics" },
      { id: "cs.SE", name: "Software Engineering" },
      { id: "cs.CR", name: "Cryptography and Security" },
      { id: "cs.DC", name: "Distributed Computing" },
    ],
    Mathematics: [
      { id: "math.ST", name: "Statistics Theory" },
      { id: "math.OC", name: "Optimization and Control" },
      { id: "math.PR", name: "Probability" },
      { id: "math.AP", name: "Analysis of PDEs" },
    ],
    Physics: [
      { id: "physics.hep-th", name: "High Energy Physics — Theory" },
      { id: "physics.cond-mat", name: "Condensed Matter" },
      { id: "physics.astro-ph", name: "Astrophysics" },
      { id: "physics.quant-ph", name: "Quantum Physics" },
    ],
    "Statistics & Economics": [
      { id: "stat.ML", name: "Machine Learning (Statistics)" },
      { id: "stat.AP", name: "Applications" },
      { id: "econ.GN", name: "General Economics" },
    ],
    Biology: [
      { id: "q-bio.NC", name: "Neurons and Cognition" },
      { id: "q-bio.GN", name: "Genomics" },
    ],
  };
}

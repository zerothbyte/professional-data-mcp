import { httpGet } from "../utils/http.js";

const OA_BASE = "https://api.openalex.org";

// ── Tool Definitions ────────────────────────────────────────────────────────

export const openAlexToolDefs = [
  {
    name: "academic_search_works",
    description:
      "Search academic papers, articles, preprints by keyword, title, or topic. Returns title, authors, abstract, citations, DOI, open-access link.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or keywords" },
        limit: {
          type: "number",
          description: "Number of results (default 5, max 25)",
          default: 5,
        },
        year_from: {
          type: "number",
          description: "Filter papers published from this year",
        },
        open_access_only: {
          type: "boolean",
          description: "Only return open-access papers (default false)",
          default: false,
        },
        sort: {
          type: "string",
          enum: ["cited_by_count", "publication_date", "relevance_score"],
          description: "Sort order (default: relevance_score)",
          default: "relevance_score",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "academic_get_paper",
    description:
      "Get full details of an academic paper by DOI or OpenAlex ID: abstract, authors, references, citation count, concepts.",
    inputSchema: {
      type: "object",
      properties: {
        identifier: {
          type: "string",
          description:
            "DOI (e.g. 10.1234/example) or OpenAlex ID (e.g. W2741809809)",
        },
      },
      required: ["identifier"],
    },
  },
  {
    name: "academic_search_authors",
    description:
      "Search academic authors/researchers. Returns name, institution, h-index, citation count, research topics.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Author name or partial name" },
        limit: { type: "number", description: "Number of results", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "academic_search_institutions",
    description:
      "Search universities and research institutions. Returns name, country, h-index, paper count, open-access rate.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Institution name, e.g. MIT, University of Indonesia",
        },
        limit: { type: "number", description: "Number of results", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "academic_get_topic_summary",
    description:
      "Get top papers and statistics for a research topic/field from OpenAlex concepts.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Research field, e.g. machine learning, climate change",
        },
        limit: { type: "number", description: "Number of top papers", default: 10 },
      },
      required: ["topic"],
    },
  },
];

// ── Handlers ────────────────────────────────────────────────────────────────

export async function handleOpenAlex(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "academic_search_works":
      return searchWorks(args);
    case "academic_get_paper":
      return getPaper(args.identifier);
    case "academic_search_authors":
      return searchAuthors(args.query, args.limit ?? 5);
    case "academic_search_institutions":
      return searchInstitutions(args.query, args.limit ?? 5);
    case "academic_get_topic_summary":
      return getTopicSummary(args.topic, args.limit ?? 10);
    default:
      throw new Error(`Unknown OpenAlex tool: ${toolName}`);
  }
}

async function searchWorks(args: Record<string, any>): Promise<string> {
  const params: Record<string, any> = {
    search: args.query,
    per_page: Math.min(args.limit ?? 5, 25),
    sort: args.sort === "relevance_score" || !args.sort ? "relevance_score:desc" : args.sort,
    mailto: "mcp@example.com",
  };

  const filters: string[] = [];
  if (args.year_from) filters.push(`from_publication_date:${args.year_from}-01-01`);
  if (args.open_access_only) filters.push("is_oa:true");
  if (filters.length) params.filter = filters.join(",");

  const data = await httpGet<any>(`${OA_BASE}/works`, params);

  const results = (data?.results ?? []).map((w: any) => ({
    id: w.id,
    title: w.title,
    year: w.publication_year,
    doi: w.doi,
    openAccess: w.open_access?.is_oa,
    oaUrl: w.open_access?.oa_url,
    citedBy: w.cited_by_count,
    authors: w.authorships?.slice(0, 3).map((a: any) => a.author?.display_name),
    abstract: w.abstract_inverted_index
      ? reconstructAbstract(w.abstract_inverted_index).substring(0, 300) + "..."
      : null,
    concepts: w.concepts?.slice(0, 5).map((c: any) => c.display_name),
  }));

  return JSON.stringify(
    { total: data?.meta?.count, results },
    null,
    2
  );
}

async function getPaper(identifier: string): Promise<string> {
  let url: string;

  if (identifier.startsWith("W")) {
    url = `${OA_BASE}/works/${identifier}`;
  } else {
    // Assume DOI
    const encodedDoi = encodeURIComponent(`https://doi.org/${identifier}`);
    url = `${OA_BASE}/works/${encodedDoi}`;
  }

  const w = await httpGet<any>(url, { mailto: "mcp@example.com" });
  if (!w?.id) return `❌ Paper not found: ${identifier}`;

  return JSON.stringify(
    {
      id: w.id,
      title: w.title,
      year: w.publication_year,
      doi: w.doi,
      openAccess: w.open_access?.is_oa,
      oaUrl: w.open_access?.oa_url,
      citedBy: w.cited_by_count,
      authors: w.authorships?.map((a: any) => ({
        name: a.author?.display_name,
        institution: a.institutions?.[0]?.display_name,
      })),
      abstract: w.abstract_inverted_index
        ? reconstructAbstract(w.abstract_inverted_index)
        : null,
      concepts: w.concepts?.slice(0, 10).map((c: any) => ({
        name: c.display_name,
        score: c.score?.toFixed(3),
      })),
      referencedWorks: w.referenced_works?.slice(0, 10),
    },
    null,
    2
  );
}

async function searchAuthors(query: string, limit: number): Promise<string> {
  const data = await httpGet<any>(`${OA_BASE}/authors`, {
    search: query,
    per_page: limit,
    mailto: "mcp@example.com",
  });

  const results = (data?.results ?? []).map((a: any) => ({
    id: a.id,
    name: a.display_name,
    institution: a.last_known_institution?.display_name,
    country: a.last_known_institution?.country_code,
    hIndex: a.summary_stats?.h_index,
    citations: a.cited_by_count,
    worksCount: a.works_count,
    topics: a.x_concepts?.slice(0, 3).map((c: any) => c.display_name),
  }));

  return JSON.stringify(results, null, 2);
}

async function searchInstitutions(query: string, limit: number): Promise<string> {
  const data = await httpGet<any>(`${OA_BASE}/institutions`, {
    search: query,
    per_page: limit,
    mailto: "mcp@example.com",
  });

  const results = (data?.results ?? []).map((inst: any) => ({
    id: inst.id,
    name: inst.display_name,
    country: inst.country_code,
    type: inst.type,
    hIndex: inst.summary_stats?.h_index,
    citations: inst.cited_by_count,
    worksCount: inst.works_count,
    oaPercent: inst.summary_stats?.oa_percent?.toFixed(1) + "%",
    homepage: inst.homepage_url,
  }));

  return JSON.stringify(results, null, 2);
}

async function getTopicSummary(topic: string, limit: number): Promise<string> {
  const data = await httpGet<any>(`${OA_BASE}/works`, {
    search: topic,
    sort: "cited_by_count:desc",
    per_page: limit,
    mailto: "mcp@example.com",
  });

  const results = (data?.results ?? []).map((w: any) => ({
    title: w.title,
    year: w.publication_year,
    citedBy: w.cited_by_count,
    doi: w.doi,
    openAccess: w.open_access?.is_oa,
  }));

  return JSON.stringify(
    { topic, totalPapers: data?.meta?.count, topPapers: results },
    null,
    2
  );
}

// Reconstruct abstract from OpenAlex inverted index format
function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}

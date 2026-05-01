import { httpGet } from "../utils/http.js";

const SS_BASE = "https://api.semanticscholar.org/graph/v1";

const PAPER_FIELDS =
  "paperId,title,abstract,year,authors,venue,externalIds,isOpenAccess,openAccessPdf,citationCount,referenceCount,fieldsOfStudy,s2FieldsOfStudy,tldr";

// ── Tool Definitions ────────────────────────────────────────────────────────

export const semanticScholarToolDefs = [
  {
    name: "scholar_search_papers",
    description:
      "Search academic papers on Semantic Scholar. Returns title, abstract, TL;DR, authors, and PDF links. NOTE: This API has strict rate limits; use sparingly and avoid repeating the same query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or keywords" },
        limit: { type: "number", description: "Max results (default 5, max 100)", default: 5 },
        year: {
          type: "string",
          description: 'Filter by year range, e.g. "2020-2024" or "2023"',
        },
        fields_of_study: {
          type: "string",
          description:
            'Comma-separated fields, e.g. "Computer Science,Medicine,Biology"',
        },
        open_access_only: {
          type: "boolean",
          description: "Only return papers with free PDF",
          default: false,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "scholar_get_paper",
    description:
      "Get full details of a paper. NOTE: This API has strict rate limits; use only for specific, high-priority papers.",
    inputSchema: {
      type: "object",
      properties: {
        paper_id: {
          type: "string",
          description:
            "Paper ID: SemanticScholar ID, DOI (doi:10.xxx), or arXiv ID (arXiv:2301.xxxxx)",
        },
      },
      required: ["paper_id"],
    },
  },
  {
    name: "scholar_get_paper_citations",
    description: "Get papers that cite a given paper.",
    inputSchema: {
      type: "object",
      properties: {
        paper_id: { type: "string", description: "Semantic Scholar Paper ID" },
        limit: { type: "number", description: "Max results (default 10)", default: 10 },
      },
      required: ["paper_id"],
    },
  },
  {
    name: "scholar_get_paper_references",
    description: "Get the reference list (bibliography) of a paper.",
    inputSchema: {
      type: "object",
      properties: {
        paper_id: { type: "string", description: "Semantic Scholar Paper ID" },
        limit: { type: "number", description: "Max results (default 10)", default: 10 },
      },
      required: ["paper_id"],
    },
  },
  {
    name: "scholar_search_authors",
    description:
      "Search for researchers on Semantic Scholar. Returns name, affiliation, h-index, citation count, and top papers.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Author name" },
        limit: { type: "number", description: "Max results", default: 5 },
      },
      required: ["query"],
    },
  },
];

// ── Handlers ────────────────────────────────────────────────────────────────

export async function handleSemanticScholar(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "scholar_search_papers":
      return searchPapers(args);
    case "scholar_get_paper":
      return getPaper(args.paper_id);
    case "scholar_get_paper_citations":
      return getPaperCitations(args.paper_id, args.limit ?? 10);
    case "scholar_get_paper_references":
      return getPaperReferences(args.paper_id, args.limit ?? 10);
    case "scholar_search_authors":
      return searchAuthors(args.query, args.limit ?? 5);
    default:
      throw new Error(`Unknown Semantic Scholar tool: ${toolName}`);
  }
}

async function searchPapers(args: Record<string, any>): Promise<string> {
  const params: Record<string, any> = {
    query: args.query,
    fields: PAPER_FIELDS,
    limit: Math.min(args.limit ?? 5, 100),
  };

  if (args.year) params.year = args.year;
  if (args.fields_of_study) params.fieldsOfStudy = args.fields_of_study;
  if (args.open_access_only) params.openAccessPdf = true;

  const data = await httpGet<any>(`${SS_BASE}/paper/search`, params);

  const results = (data?.data ?? []).map((p: any) => ({
    paperId: p.paperId,
    title: p.title,
    year: p.year,
    venue: p.venue,
    citationCount: p.citationCount,
    referenceCount: p.referenceCount,
    openAccess: p.isOpenAccess,
    pdfUrl: p.openAccessPdf?.url,
    tldr: p.tldr?.text,
    authors: p.authors?.slice(0, 3).map((a: any) => a.name),
    fieldsOfStudy: p.fieldsOfStudy,
    doi: p.externalIds?.DOI,
    arxiv: p.externalIds?.ArXiv,
  }));

  return JSON.stringify(
    { total: data?.total, results },
    null,
    2
  );
}

async function getPaper(paperId: string): Promise<string> {
  // Normalize identifiers
  let id = paperId;
  if (paperId.startsWith("10.")) id = `DOI:${paperId}`;
  else if (/^\d{4}\.\d{4,5}/.test(paperId)) id = `ARXIV:${paperId}`;

  const data = await httpGet<any>(`${SS_BASE}/paper/${id}`, {
    fields: PAPER_FIELDS + ",references,citations",
  });

  if (!data?.paperId) return `❌ Paper not found: ${paperId}`;

  return JSON.stringify(
    {
      paperId: data.paperId,
      title: data.title,
      year: data.year,
      venue: data.venue,
      abstract: data.abstract,
      tldr: data.tldr?.text,
      citationCount: data.citationCount,
      referenceCount: data.referenceCount,
      openAccess: data.isOpenAccess,
      pdfUrl: data.openAccessPdf?.url,
      authors: data.authors?.map((a: any) => a.name),
      fieldsOfStudy: data.fieldsOfStudy,
      doi: data.externalIds?.DOI,
      arxiv: data.externalIds?.ArXiv,
    },
    null,
    2
  );
}

async function getPaperCitations(paperId: string, limit: number): Promise<string> {
  const data = await httpGet<any>(
    `${SS_BASE}/paper/${paperId}/citations`,
    {
      fields: "title,year,authors,citationCount,isOpenAccess",
      limit,
    }
  );

  const results = (data?.data ?? []).map((c: any) => ({
    paperId: c.citingPaper?.paperId,
    title: c.citingPaper?.title,
    year: c.citingPaper?.year,
    citations: c.citingPaper?.citationCount,
    authors: c.citingPaper?.authors?.slice(0, 2).map((a: any) => a.name),
  }));

  return JSON.stringify(results, null, 2);
}

async function getPaperReferences(paperId: string, limit: number): Promise<string> {
  const data = await httpGet<any>(
    `${SS_BASE}/paper/${paperId}/references`,
    {
      fields: "title,year,authors,citationCount",
      limit,
    }
  );

  const results = (data?.data ?? []).map((r: any) => ({
    paperId: r.citedPaper?.paperId,
    title: r.citedPaper?.title,
    year: r.citedPaper?.year,
    citations: r.citedPaper?.citationCount,
    authors: r.citedPaper?.authors?.slice(0, 2).map((a: any) => a.name),
  }));

  return JSON.stringify(results, null, 2);
}

async function searchAuthors(query: string, limit: number): Promise<string> {
  const data = await httpGet<any>(`${SS_BASE}/author/search`, {
    query,
    fields: "authorId,name,affiliations,hIndex,citationCount,paperCount,homepage",
    limit,
  });

  const results = (data?.data ?? []).map((a: any) => ({
    authorId: a.authorId,
    name: a.name,
    affiliations: a.affiliations,
    hIndex: a.hIndex,
    citations: a.citationCount,
    papers: a.paperCount,
    homepage: a.homepage,
  }));

  return JSON.stringify(results, null, 2);
}

import { httpGet } from "../utils/http.js";

const CR_BASE = "https://api.crossref.org";

// ── Tool Definitions ────────────────────────────────────────────────────────

export const crossrefToolDefs = [
  {
    name: "crossref_lookup_doi",
    description:
      "Look up full bibliographic metadata for a DOI: title, authors, journal, publisher, publication date, ISSN, volume, issue, pages, abstract.",
    inputSchema: {
      type: "object",
      properties: {
        doi: {
          type: "string",
          description: "DOI string, e.g. 10.1038/nature12373",
        },
      },
      required: ["doi"],
    },
  },
  {
    name: "crossref_search_works",
    description:
      "Search academic works (articles, books, conference papers, preprints) in the Crossref database by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword or phrase" },
        limit: { type: "number", description: "Number of results (default 5)", default: 5 },
        filter_type: {
          type: "string",
          enum: ["journal-article", "book-chapter", "proceedings-article", "dissertation", "preprint", "book"],
          description: "Filter by publication type",
        },
        from_year: { type: "number", description: "Filter from publication year" },
        to_year: { type: "number", description: "Filter to publication year" },
        sort: {
          type: "string",
          enum: ["score", "published", "is-referenced-by-count"],
          description: "Sort order (default: score)",
          default: "score",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "crossref_search_journals",
    description:
      "Search journals and periodicals. Returns ISSN, publisher, impact factor, subject areas.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Journal name or ISSN" },
        limit: { type: "number", description: "Number of results", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "crossref_get_journal_articles",
    description:
      "Get recent articles published in a specific journal by ISSN.",
    inputSchema: {
      type: "object",
      properties: {
        issn: {
          type: "string",
          description: "Journal ISSN, e.g. 0028-0836 (Nature)",
        },
        limit: { type: "number", description: "Number of articles", default: 10 },
        from_year: { type: "number", description: "Filter from year" },
      },
      required: ["issn"],
    },
  },
];

// ── Handlers ────────────────────────────────────────────────────────────────

export async function handleCrossref(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "crossref_lookup_doi":
      return lookupDoi(args.doi);
    case "crossref_search_works":
      return searchWorks(args);
    case "crossref_search_journals":
      return searchJournals(args.query, args.limit ?? 5);
    case "crossref_get_journal_articles":
      return getJournalArticles(args.issn, args.limit ?? 10, args.from_year);
    default:
      throw new Error(`Unknown Crossref tool: ${toolName}`);
  }
}

async function lookupDoi(doi: string): Promise<string> {
  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, "");

  const data = await httpGet<any>(`${CR_BASE}/works/${encodeURIComponent(cleanDoi)}`, {
    mailto: "mcp@example.com",
  });

  const w = data?.message;
  if (!w) return `❌ DOI not found: ${doi}`;

  return JSON.stringify(
    {
      doi: w.DOI,
      title: w.title?.[0],
      type: w.type,
      journal: w["container-title"]?.[0],
      publisher: w.publisher,
      publishedDate: formatDate(w.published),
      volume: w.volume,
      issue: w.issue,
      pages: w.page,
      issn: w.ISSN,
      authors: w.author?.map((a: any) =>
        [a.given, a.family].filter(Boolean).join(" ")
      ),
      abstract: w.abstract?.replace(/<[^>]+>/g, "") ?? null,
      citedBy: w["is-referenced-by-count"],
      references: w["references-count"],
      license: w.license?.[0]?.URL,
      url: w.URL,
      funder: w.funder?.map((f: any) => f.name),
    },
    null,
    2
  );
}

  // Map intuitive sort names to Crossref specific fields
  const sortMapping: Record<string, string> = {
    "cited_by_count": "is-referenced-by-count",
    "is-referenced-by-count": "is-referenced-by-count",
    "score": "score",
    "published": "published"
  };

  const params: Record<string, any> = {
    query: args.query,
    rows: Math.min(args.limit ?? 5, 100),
    sort: sortMapping[args.sort] ?? "score",
    order: "desc",
    select:
      "DOI,title,author,container-title,published,type,is-referenced-by-count,ISSN,publisher",
    mailto: "mcp@example.com",
  };

  const filters: string[] = [];
  if (args.filter_type) filters.push(`type:${args.filter_type}`);
  if (args.from_year) filters.push(`from-pub-date:${args.from_year}`);
  if (args.to_year) filters.push(`until-pub-date:${args.to_year}`);
  if (filters.length) params.filter = filters.join(",");

  const data = await httpGet<any>(`${CR_BASE}/works`, params);

  const results = (data?.message?.items ?? []).map((w: any) => ({
    doi: w.DOI,
    title: w.title?.[0],
    journal: w["container-title"]?.[0],
    publisher: w.publisher,
    type: w.type,
    year: w.published?.["date-parts"]?.[0]?.[0],
    citedBy: w["is-referenced-by-count"],
    authors: w.author
      ?.slice(0, 3)
      .map((a: any) => [a.given, a.family].filter(Boolean).join(" ")),
  }));

  return JSON.stringify(
    { total: data?.message?.["total-results"], results },
    null,
    2
  );
}

async function searchJournals(query: string, limit: number): Promise<string> {
  const data = await httpGet<any>(`${CR_BASE}/journals`, {
    query,
    rows: limit,
    mailto: "mcp@example.com",
  });

  const results = (data?.message?.items ?? []).map((j: any) => ({
    title: j.title,
    issn: j.ISSN,
    publisher: j.publisher,
    subjects: j.subjects?.map((s: any) => s.name),
    totalDocs: j["total-dois"],
    breakdowns: j.breakdowns?.dois_by_issued_year?.slice(-5),
  }));

  return JSON.stringify(results, null, 2);
}

async function getJournalArticles(
  issn: string,
  limit: number,
  fromYear?: number
): Promise<string> {
  const params: Record<string, any> = {
    rows: limit,
    sort: "published",
    order: "desc",
    select:
      "DOI,title,author,published,abstract,is-referenced-by-count",
    mailto: "mcp@example.com",
  };

  if (fromYear) params.filter = `from-pub-date:${fromYear}`;

  const data = await httpGet<any>(
    `${CR_BASE}/journals/${issn}/works`,
    params
  );

  const results = (data?.message?.items ?? []).map((w: any) => ({
    doi: w.DOI,
    title: w.title?.[0],
    year: w.published?.["date-parts"]?.[0]?.[0],
    citedBy: w["is-referenced-by-count"],
    authors: w.author
      ?.slice(0, 3)
      .map((a: any) => [a.given, a.family].filter(Boolean).join(" ")),
    abstract: w.abstract?.replace(/<[^>]+>/g, "")?.substring(0, 200),
  }));

  return JSON.stringify(results, null, 2);
}

function formatDate(dateObj: any): string | null {
  if (!dateObj?.["date-parts"]?.[0]) return null;
  const [y, m, d] = dateObj["date-parts"][0];
  return [y, m, d].filter(Boolean).join("-");
}

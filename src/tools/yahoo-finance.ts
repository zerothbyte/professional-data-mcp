import { httpGet } from "../utils/http.js";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance";
const YF_SEARCH = "https://query1.finance.yahoo.com/v1/finance/search";
const YF_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

// ── Tool Definitions ────────────────────────────────────────────────────────

export const yahooFinanceToolDefs = [
  {
    name: "finance_get_quote",
    description:
      "Get real-time stock/ETF/index quote. Returns price, change, volume, market cap, P/E ratio, 52-week high/low.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Ticker symbol, e.g. AAPL, TSLA, ^GSPC, BTC-USD",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "finance_search",
    description:
      "Search for stocks, ETFs, funds, or crypto by company name or keyword.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword or company name" },
        limit: {
          type: "number",
          description: "Max results (default 5, max 20)",
          default: 5,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "finance_get_historical",
    description:
      "Get historical OHLCV (open/high/low/close/volume) price data for a symbol.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        period: {
          type: "string",
          enum: ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"],
          description: "Time period",
          default: "1mo",
        },
        interval: {
          type: "string",
          enum: ["1d", "1wk", "1mo"],
          description: "Data interval",
          default: "1d",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "finance_get_financials",
    description:
      "Get key financial metrics: revenue, earnings, profit margin, debt, ROE, etc.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
      },
      required: ["symbol"],
    },
  },
];

// ── Handlers ────────────────────────────────────────────────────────────────

export async function handleYahooFinance(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case "finance_get_quote":
      return getQuote(args.symbol);
    case "finance_search":
      return searchSymbol(args.query, args.limit ?? 5);
    case "finance_get_historical":
      return getHistorical(args.symbol, args.period ?? "1mo", args.interval ?? "1d");
    case "finance_get_financials":
      return getFinancials(args.symbol);
    default:
      throw new Error(`Unknown Yahoo Finance tool: ${toolName}`);
  }
}

async function getQuote(symbol: string): Promise<string> {
  const data = await httpGet<any>(`${YF_BASE}/quote`, {
    symbols: symbol.toUpperCase(),
    fields:
      "regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,trailingPE,fiftyTwoWeekHigh,fiftyTwoWeekLow,shortName,currency",
  });

  const result = data?.quoteResponse?.result?.[0];
  if (!result) return `❌ Symbol "${symbol}" not found.`;

  return JSON.stringify(
    {
      symbol: result.symbol,
      name: result.shortName,
      price: result.regularMarketPrice,
      change: result.regularMarketChange?.toFixed(2),
      changePercent: result.regularMarketChangePercent?.toFixed(2) + "%",
      volume: result.regularMarketVolume?.toLocaleString(),
      marketCap: result.marketCap,
      peRatio: result.trailingPE?.toFixed(2),
      week52High: result.fiftyTwoWeekHigh,
      week52Low: result.fiftyTwoWeekLow,
      currency: result.currency,
    },
    null,
    2
  );
}

async function searchSymbol(query: string, limit: number): Promise<string> {
  const data = await httpGet<any>(YF_SEARCH, {
    q: query,
    quotesCount: Math.min(limit, 20),
    newsCount: 0,
  });

  const quotes = data?.quotes ?? [];
  if (!quotes.length) return `No results found for "${query}"`;

  const results = quotes.map((q: any) => ({
    symbol: q.symbol,
    name: q.longname || q.shortname,
    type: q.quoteType,
    exchange: q.exchange,
  }));

  return JSON.stringify(results, null, 2);
}

async function getHistorical(
  symbol: string,
  period: string,
  interval: string
): Promise<string> {
  const data = await httpGet<any>(`${YF_CHART}/${symbol.toUpperCase()}`, {
    range: period,
    interval,
    includePrePost: false,
  });

  const chart = data?.chart?.result?.[0];
  if (!chart) return `❌ No data for "${symbol}"`;

  const timestamps: number[] = chart.timestamp ?? [];
  const ohlcv = chart.indicators?.quote?.[0] ?? {};

  const rows = timestamps.slice(-30).map((ts: number, i: number) => ({
    date: new Date(ts * 1000).toISOString().split("T")[0],
    open: ohlcv.open?.[i]?.toFixed(2),
    high: ohlcv.high?.[i]?.toFixed(2),
    low: ohlcv.low?.[i]?.toFixed(2),
    close: ohlcv.close?.[i]?.toFixed(2),
    volume: ohlcv.volume?.[i],
  }));

  return JSON.stringify(
    { symbol: symbol.toUpperCase(), period, interval, data: rows },
    null,
    2
  );
}

async function getFinancials(symbol: string): Promise<string> {
  const data = await httpGet<any>(`${YF_BASE}/quote`, {
    symbols: symbol.toUpperCase(),
    fields:
      "revenue,grossProfits,ebitda,netIncome,totalDebt,returnOnEquity,returnOnAssets,profitMargins,revenueGrowth,earningsGrowth,currentRatio,debtToEquity,freeCashflow",
  });

  const result = data?.quoteResponse?.result?.[0];
  if (!result) return `❌ Symbol "${symbol}" not found.`;

  return JSON.stringify(
    {
      symbol: result.symbol,
      revenue: result.revenue,
      grossProfits: result.grossProfits,
      ebitda: result.ebitda,
      netIncome: result.netIncome,
      totalDebt: result.totalDebt,
      freeCashflow: result.freeCashflow,
      returnOnEquity: result.returnOnEquity,
      returnOnAssets: result.returnOnAssets,
      profitMargins: result.profitMargins,
      currentRatio: result.currentRatio,
      debtToEquity: result.debtToEquity,
    },
    null,
    2
  );
}

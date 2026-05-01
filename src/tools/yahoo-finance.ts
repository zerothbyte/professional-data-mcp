import YahooFinance from "yahoo-finance2";

// Create a singleton instance for the entire module
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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
          enum: ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"],
          description: "Time period (default: 1mo)",
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
  try {
    const result: any = await yf.quote(symbol.toUpperCase());
    if (!result) return `❌ Symbol "${symbol}" not found.`;

    return JSON.stringify(
      {
        symbol: result.symbol,
        name: result.shortName ?? result.longName,
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
  } catch (err: any) {
    return `❌ Failed to get quote for "${symbol}": ${err?.message ?? String(err)}`;
  }
}

async function searchSymbol(query: string, limit: number): Promise<string> {
  try {
    const data: any = await yf.search(query, {
      quotesCount: Math.min(limit, 20),
      newsCount: 0,
    });

    const quotes = data?.quotes ?? [];
    if (!quotes.length) return `No results found for "${query}"`;

    const results = quotes.map((q: any) => ({
      symbol: q.symbol,
      name: q.longname ?? q.shortname,
      type: q.quoteType,
      exchange: q.exchange,
    }));

    return JSON.stringify(results, null, 2);
  } catch (err: any) {
    return `❌ Search failed: ${err?.message ?? String(err)}`;
  }
}

async function getHistorical(
  symbol: string,
  period: string,
  interval: string
): Promise<string> {
  try {
    const periodDays: Record<string, number> = {
      "1d": 1, "5d": 5, "1mo": 30, "3mo": 90, "6mo": 180,
      "1y": 365, "2y": 730, "5y": 1825, "10y": 3650, "max": 36500,
    };
    const days = periodDays[period] ?? 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result: any = await yf.chart(symbol.toUpperCase(), {
      period1: startDate.toISOString().split("T")[0],
      interval: interval as "1d" | "1wk" | "1mo",
    });

    if (!result?.quotes?.length) return `❌ No data for "${symbol}"`;

    const rows = result.quotes.slice(-30).map((q: any) => ({
      date: q.date instanceof Date
        ? q.date.toISOString().split("T")[0]
        : String(q.date).split("T")[0],
      open: q.open?.toFixed(2),
      high: q.high?.toFixed(2),
      low: q.low?.toFixed(2),
      close: q.close?.toFixed(2),
      volume: q.volume,
    }));

    return JSON.stringify(
      { symbol: symbol.toUpperCase(), period, interval, data: rows },
      null,
      2
    );
  } catch (err: any) {
    return `❌ Historical data failed for "${symbol}": ${err?.message ?? String(err)}`;
  }
}

async function getFinancials(symbol: string): Promise<string> {
  try {
    const result: any = await yf.quoteSummary(symbol.toUpperCase(), {
      modules: ["financialData", "defaultKeyStatistics", "incomeStatementHistory"],
    });

    if (!result) return `❌ Symbol "${symbol}" not found.`;

    const fin = result.financialData ?? {};
    const stats = result.defaultKeyStatistics ?? {};

    return JSON.stringify(
      {
        symbol: symbol.toUpperCase(),
        currentPrice: fin.currentPrice,
        revenue: fin.totalRevenue,
        revenueGrowth: fin.revenueGrowth,
        grossProfits: fin.grossProfits,
        ebitda: fin.ebitda,
        totalDebt: fin.totalDebt,
        totalCash: fin.totalCash,
        freeCashflow: fin.freeCashflow,
        returnOnEquity: fin.returnOnEquity,
        returnOnAssets: fin.returnOnAssets,
        profitMargins: fin.profitMargins,
        debtToEquity: fin.debtToEquity,
        currentRatio: fin.currentRatio,
        earningsGrowth: fin.earningsGrowth,
        enterpriseValue: stats.enterpriseValue,
        forwardPE: stats.forwardPE,
        pegRatio: stats.pegRatio,
        priceToBook: stats.priceToBook,
      },
      null,
      2
    );
  } catch (err: any) {
    return `❌ Financials failed for "${symbol}": ${err?.message ?? String(err)}`;
  }
}

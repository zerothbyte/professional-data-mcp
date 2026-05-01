# 📊 Professional Data MCP Server

MCP Server to retrieve professional data — similar to the **Kimi Professional Data** feature.

## 🗂 Data Sources

| Source | Tools | Description |
|--------|-------|-------------|
| **Yahoo Finance** | 4 tools | Real-time stock prices, historical data, financial reports |
| **World Bank** | 3 tools | GDP, population, inflation, employment, etc. |
| **OpenAlex** | 5 tools | Journals, papers, authors, institutions (200M+ works) |
| **Semantic Scholar** | 5 tools | Papers + AI TL;DR summary, citations |
| **Crossref** | 4 tools | DOI metadata, journals, bibliography |

**Total: 21 tools ready to use — no API key required!**

---

## 🚀 Quick Start

### Option 1: Hosting on Railway (Recommended)
1. Push this repo to GitHub.
2. Connect it to **Railway**.
3. Railway will automatically build and run the server.
4. You will get a URL like `https://pro-data-mcp.up.railway.app`.

### Option 2: Run Locally
```bash
npm install
npm run build
npm start
```

---

## 🔗 Connecting to AI

### 1. Cursor / Llama.cpp (Modern)
Add the MCP server with the following URL:
`https://YOUR-URL.railway.app/mcp?apiKey=123`

### 2. Claude Desktop (Legacy)
Edit `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "professional-data": {
      "command": "curl",
      "args": ["-s", "https://YOUR-URL.railway.app/sse?apiKey=123"]
    }
  }
}
```
> **Note**: For Claude Desktop via Remote SSE, ensure you use a command that supports SSE streams (like `curl` or a specific adapter).

---

## 📋 Tool List

### 💹 Yahoo Finance

| Tool | Description |
|------|-------------|
| `finance_get_quote` | Real-time price: AAPL, BTC-USD, etc. |
| `finance_search` | Search for stocks/ETF/crypto symbols |
| `finance_get_historical` | Daily/weekly/monthly OHLCV data |
| `finance_get_financials` | Revenue, EBITDA, ROE, debt ratio |

**Example prompt:**
> "What is the price of AAPL right now and its performance for the last 3 months?"

---

### 🌍 World Bank

| Tool | Description |
|------|-------------|
| `worldbank_get_indicator` | GDP, inflation, unemployment, etc. per country |
| `worldbank_country_profile` | Complete economic profile of a country |
| `worldbank_search_countries` | List of all countries + codes |

**Example prompt:**
> "Compare GDP per capita of Indonesia vs Vietnam from 2015-2023"

**Available Indicators:** gdp, gdp_per_capita, gdp_growth, population, inflation, unemployment, poverty_rate, literacy_rate, life_expectancy, exports, imports, fdi, gini, co2_emissions, internet_users

---

### 📚 OpenAlex (Academic Data)

| Tool | Description |
|------|-------------|
| `academic_search_works` | Search academic papers by keyword |
| `academic_get_paper` | Paper details by DOI/OpenAlex ID |
| `academic_search_authors` | Search researchers + h-index |
| `academic_search_institutions` | Search universities/research institutions |
| `academic_get_topic_summary` | Top papers based on topic |

**Example prompt:**
> "Find the latest 5 papers on large language models from 2024, that are open access"

---

### 🎓 Semantic Scholar

| Tool | Description |
|------|-------------|
| `scholar_search_papers` | Search papers + AI TL;DR summary |
| `scholar_get_paper` | Full details + abstract + summary |
| `scholar_get_paper_citations` | Papers citing this paper |
| `scholar_get_paper_references` | List of references/bibliography |
| `scholar_search_authors` | Search researchers + h-index |

**Example prompt:**
> "Find papers about RAG (Retrieval Augmented Generation), show the TL;DR"

---

### 📖 Crossref

| Tool | Description |
|------|-------------|
| `crossref_lookup_doi` | Complete metadata from DOI |
| `crossref_search_works` | Search academic works |
| `crossref_search_journals` | Search scientific journals |
| `crossref_get_journal_articles` | Latest articles from a journal (by ISSN) |

**Example prompt:**
> "Lookup DOI 10.1038/nature12373 and show its full information"

---

## 🛠 Development

```bash
# Run directly (without build)
npm run dev

# Build for production
npm run build

# Start production build
npm start
```

## 📁 Project Structure

```
professional-data-mcp/
├── src/
│   ├── index.ts              ← Main MCP server
│   ├── tools/
│   │   ├── yahoo-finance.ts  ← Finance tools
│   │   ├── world-bank.ts     ← Economic data
│   │   ├── openalex.ts       ← Academic search
│   │   ├── semantic-scholar.ts ← Paper + AI summary
│   │   └── crossref.ts       ← DOI & journal metadata
│   └── utils/
│       └── http.ts           ← HTTP helper
├── dist/                     ← Compiled JS (after npm run build)
├── package.json
├── tsconfig.json
└── README.md
```

## ⚡ Usage Tips

- **Stock Symbols**: Use suffixes if needed — e.g., `AAPL`, `BTC-USD`
- **Indices**: `^GSPC` (S&P 500), `^IXIC` (Nasdaq)
- **Country Codes**: `ID` = Indonesia, `US` = USA, `CN` = China
- **DOI Prefix**: Can use `10.xxx/xxx` directly, without `https://doi.org/`

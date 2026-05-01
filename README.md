# Professional Data MCP Server

A professional-grade Model Context Protocol (MCP) server that provides AI assistants with real-time access to financial, academic, and global development data. 

Built with **Express.js** and **TypeScript**, supporting both **SSE** (legacy clients like Claude Desktop) and **Streamable HTTP** (modern clients like Cursor and Llama.cpp).

---

## 🚀 Features & Tools

### 📈 Financial Data (Yahoo Finance)
| Tool | Description |
|------|-------------|
| `finance_get_quote` | Real-time stock/ETF/index quotes (Price, Change, PE, etc.) |
| `finance_search` | Search for ticker symbols by company name |
| `finance_get_historical` | Historical price data (OHLCV) for trend analysis |
| `finance_get_financials` | Key financial metrics (Revenue, Debt, ROE, EBIDTA) |

### 📚 arXiv (Advanced Research)
| Tool | Description |
|------|-------------|
| `arxiv_search_papers` | Advanced search with field prefixes (`ti:`, `au:`, `cat:`) and date filtering |
| `arxiv_get_paper_data` | Full bibliographic metadata for a specific arXiv ID |
| `arxiv_get_full_paper_text` | **Experimental**: Downloads and extracts text content from PDF papers |
| `arxiv_list_categories` | Browse research categories (AI, Machine Learning, etc.) |
| `arxiv_update_categories` | Scrapes the latest taxonomy directly from arXiv.org |

### 🎓 Academic & Scientific Data
| Tool | Description |
|------|-------------|
| `academic_search_works` | Search millions of papers via **OpenAlex** |
| `academic_get_topic_summary` | Get key research insights for a specific topic |
| `scholar_search_papers` | Search **Semantic Scholar** with AI-generated TL;DR summaries |
| `crossref_search_works` | Search and filter academic works via **Crossref** metadata |

### 🌍 Global Development (World Bank)
| Tool | Description |
|------|-------------|
| `worldbank_get_indicator` | Fetch global development indicators (GDP, Inflation, etc.) |
| `worldbank_search_indicators` | Find specific data points within the World Bank database |

### 🛠 Utilities
| Tool | Description |
|------|-------------|
| `utilities_get_current_time` | Get real-time system date/time (Essential for AI time-awareness) |

---

## 🛠 Installation & Setup

### Local Development
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build and Start:
   ```bash
   npm run build
   npm start
   ```
The server will listen on `http://localhost:3000`.

---

## 🔌 Connection Guide

### 1. Cursor / Llama.cpp (Streamable HTTP)
Use the following endpoint URL. **Note**: Cursor requires a dummy query parameter.
```text
http://localhost:3000/mcp?apiKey=123
```

### 2. Claude Desktop (SSE)
Add this to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "professional-data": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

---

## ☁️ Deployment

### Railway.app
This project is ready for one-click deployment on Railway. 
1. Connect your GitHub repository to Railway.
2. The `Procfile` and `Dockerfile` are already configured.
3. Ensure the `PORT` environment variable is set to `3000`.

---

## 📝 License
Distributed under the **MIT License**. See `LICENSE` for more information.

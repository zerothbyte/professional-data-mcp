# arXiv MCP Server (TypeScript)

MCP server yang memungkinkan Claude dan AI lain mencari paper akademik dari arXiv,
dapat diakses via URL publik (seperti mcp.andybrandt.net/arxiv).

## Fitur

- `search_papers` — cari paper berdasarkan keyword, author, kategori
- `get_paper` — ambil detail lengkap paper berdasarkan arXiv ID
- `list_categories` — lihat semua kategori arXiv yang tersedia
- Rate limiting otomatis sesuai aturan arXiv API (max 3 req/detik)
- CORS headers untuk kompatibilitas dengan Claude.ai

## Cara Pakai (Development)

```bash
npm install
npm run dev
```

Server berjalan di `http://localhost:3000`

## Cara Pakai (Production)

```bash
npm install
npm run build
npm start
```

## Endpoint

| Endpoint | Keterangan |
|----------|-----------|
| `GET /` | Health check, info server |
| `GET /arxiv` | SSE endpoint untuk MCP client |
| `POST /arxiv/message` | Terima pesan dari MCP client |

## Cara Tambahkan ke Claude.ai

1. Buka [Claude.ai Settings → Connectors](https://claude.ai/settings/connectors)
2. Klik "Add custom connector"
3. Paste URL: `https://domain-kamu.com/arxiv`
4. Beri nama, klik Add

## Deploy ke Railway.app

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login & deploy
railway login
railway init
railway up
```

Setelah deploy, Railway memberi URL otomatis seperti:
`https://arxiv-mcp-production.up.railway.app/arxiv`

## Deploy via Docker

```bash
docker build -t arxiv-mcp .
docker run -p 3000:3000 arxiv-mcp
```

## Contoh Penggunaan (setelah terhubung ke Claude)

- "Cari paper terbaru tentang large language models"
- "Cari paper dari Andrej Karpathy tentang neural networks"
- "Ambil detail paper arXiv ID 2301.07041"
- "Tampilkan semua kategori cs.AI"
- "Cari paper tentang diffusion models di kategori cs.CV"

## Environment Variables

| Variable | Default | Keterangan |
|----------|---------|-----------|
| `PORT` | `3000` | Port server |

## Struktur Kode

```
src/
├── index.ts    # Express server + MCP tools + SSE handler
└── arxiv.ts    # arXiv API client (fetch + parse XML)
```

## Catatan arXiv API

- Tidak perlu API key, sepenuhnya gratis
- Rate limit: 3 request/detik (sudah di-handle otomatis)
- Hasil dalam format Atom 1.0 XML, di-parse dengan fast-xml-parser

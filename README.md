# minimi

A single-user research chat that searches the live web, shows sources, and remembers conversations across restarts.

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm install
Copy-Item .env.example .env # PowerShell; on macOS/Linux use: cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`, then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The model defaults to `gpt-6-astra`; change `OPENAI_MODEL` in `.env` to use another model supported by the Responses API and web search. `PORT` defaults to `3000`. The key is only read by the Node server and is never sent to the browser.

## What it does

- Uses the OpenAI Responses API with its built-in `web_search` tool. The model may decide when a web search is needed; web-grounded claims include prominent source links.
- Saves conversation messages locally in `data/minimi.sqlite`. A SQLite inverted term index supports relevant history recall without depending on provider-side conversation storage or a native SQLite package.
- Interprets date references using the browser's IANA timezone. The exact date is passed with matching history to the model for recall and follow-up research.
- Keeps one local user's conversations. Use **Clear history** to delete them from this device.
- Includes a captioned [60-second product tour](public/minimi-demo.webm); open **Watch demo** in the app to play it or download it. The tour is illustrative and does not need an API key.

## Development

```bash
npm test
npm run eval
npm run build
```

The tests use an in-memory database and a mocked model stream; they do not require an API key or make web requests. `npm run eval` runs a 30-query memory retrieval benchmark against a fixed multi-chat corpus and reports Recall@6 plus exact-date recall. It is deterministic and does not call the model or upload conversation data.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes, for live chat | — | Authenticates server requests to OpenAI |
| `OPENAI_MODEL` | No | `gpt-6-astra` | Responses API model |
| `PORT` | No | `3000` | Local HTTP port |
| `DATABASE_PATH` | No | `data/minimi.sqlite` | Local chat history database |

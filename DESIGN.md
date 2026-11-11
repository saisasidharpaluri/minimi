# Design: minimi

## How it works

The browser talks to a small Node and Express server. The server stores messages in local SQLite, retrieves relevant prior turns, and sends the current message plus that context to the OpenAI Responses API. The only model tool enabled is `web_search`. Responses stream to the UI as they arrive; citation annotations are saved with the answer and rendered as clickable source links. The API key stays on the server.

History is deliberately app-managed. A SQLite inverted term index retrieves semantically useful prior messages from any saved chat, while explicit dates filter history before ranking. Timestamps are stored in UTC and translated using the browser's IANA timezone, so “3 November” and “last Tuesday” refer to the user's calendar. No provider conversation object is needed to preserve user memory.

## Why this shape

The sample prompts require two kinds of grounding at once: remember what the user previously asked or shortlisted, then check current facts. Keeping those steps distinct prevents stale answers from being repeated as current truth. The assistant instructions ask it to identify the remembered products and claims, search for updates, prefer official pricing and release pages, describe the comparison window, and acknowledge uncertainty. The built-in search returns citation annotations alongside the response, avoiding a second search service and a separate citation reconciliation pass.

The persistent database is local and user-controlled. A real SQLite database is more durable than browser storage and can retrieve across conversations and restarts. This Node runtime's SQLite build omits FTS5, so the project uses a compact indexed term table instead of relying on a native addon. That keeps installs simple and the data model inspectable. Conversation content remains on the machine except when sent as model context to answer a request.

## Considered and rejected

- **Provider-managed conversation state:** simpler turn handling, but poor fit for local history search and makes memory depend on another stored copy.
- **Browser-only storage:** avoids a server database but is harder to search, export, and recover consistently; it does not meet the cross-session retrieval goal as well.
- **A second search API:** adds another key, another failure mode, and citation mapping work. The built-in tool is sufficient for this one-tool agent.
- **Embeddings and a vector store:** potentially better semantic recall at larger scale, but add latency, cost, setup, and another dependency. The inverted index is fast and adequate for a single user's chat history; evaluations should show where it misses.
- **A multi-agent workflow:** adds orchestration and latency without a demonstrated need. One capable model can recall, search, and synthesize in a single response.

## With another week

Build a repeatable benchmark from realistic multi-turn tasks, including paraphrased follow-ups, ambiguous dates, and pricing/release comparisons. Measure factual support, citation coverage, missed-history rate, latency, and spend. Use those results to tune retrieval and prompts before adding embeddings. Also add export/import, configurable retention, and a user-visible history search. For shared or hosted use, add authentication, encryption, backup/retention controls, and request-level observability before deployment.

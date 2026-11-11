# Design: minimi

## How it works

The browser talks to a small Node and Express server. The server stores messages in local SQLite, retrieves relevant prior turns, and sends the current message plus that context to the OpenAI Responses API. The only model tool enabled is `web_search`. Responses stream to the UI as they arrive; citation annotations are saved with the answer and rendered as clickable source links. The API key stays on the server.

History is deliberately app-managed. Each completed turn creates a structured memory record with the exact question, answer, extracted entities, timestamp, and source links. A SQLite inverted term index recalls those records across chats, while explicit dates use timezone-correct UTC boundaries. Timestamps are stored in UTC and translated using the browser's IANA timezone, so “3 November” and “last Tuesday” refer to the user's calendar. No provider conversation object is needed to preserve user memory.

## Why this shape

The sample prompts require two kinds of grounding at once: remember what the user previously asked or shortlisted, then check current facts. Keeping those steps distinct prevents stale answers from being repeated as current truth. The assistant instructions ask it to identify every remembered product and claim, search for updates, prefer official pricing and release pages, describe the comparison window, report per-product status, and acknowledge uncertainty. Citation annotations are attached both to the specific claim and to a source list.

The persistent database is local and user-controlled. A real SQLite database is more durable than browser storage and can retrieve across conversations and restarts. This Node runtime's SQLite build omits FTS5, so the project uses a compact indexed term table instead of relying on a native addon. That keeps installs simple and the data model inspectable. Conversation content remains on the machine except when sent as model context to answer a request.

A local 30-query benchmark measures whether the right saved turn is recalled for exact-date, cross-chat, product, and pricing follow-ups. The current fixture suite gets 30/30 Recall@6, including 10/10 exact-date cases. Retrieval misses are a release gate; this offline score does not measure live answer correctness, which needs a separate review against current sources. The benchmark never uploads its fixture conversations.

## Considered and rejected

- **Provider-managed conversation state:** simpler turn handling, but poor fit for local history search and makes memory depend on another stored copy.
- **Browser-only storage:** avoids a server database but is harder to search, export, and recover consistently; it does not meet the cross-session retrieval goal as well.
- **A second search API:** adds another key, another failure mode, and citation mapping work. The built-in tool is sufficient for this one-tool agent.
- **Embeddings and a vector store:** potentially better paraphrase recall at larger scale, but add latency, cost, setup, and another dependency. The benchmark provides a threshold for adding them if lexical retrieval misses too often.
- **A multi-agent workflow:** adds orchestration and latency without a demonstrated need. One capable model can recall, search, and synthesize in a single response.

## With another week

Expand the benchmark with paraphrased follow-ups, ambiguous dates, and archived source snapshots so answer support and citation coverage can be measured reproducibly. Track latency and spend alongside retrieval misses, then add embeddings only if the results justify them. Also add export/import, configurable retention, and a user-visible history search. For shared or hosted use, add authentication, encryption, backup/retention controls, and request-level observability before deployment.

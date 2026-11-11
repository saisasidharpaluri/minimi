import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ChatAgent, createOpenAIClient } from "./agent.js";
import { ChatStore } from "./store.js";

const port = Number(process.env.PORT ?? 3000);
const store = new ChatStore(process.env.DATABASE_PATH ?? "data/minimi.sqlite");
const app = express();
app.use(express.json({ limit: "64kb" }));
app.get("/api/config", (_req, res) => res.json({ configured: Boolean(process.env.OPENAI_API_KEY) }));
app.get("/api/conversations", (_req, res) => res.json(store.listConversations()));
app.post("/api/conversations", (_req, res) => {
  const id = randomUUID();
  const now = new Date().toISOString();
  store.createConversation(id, "New chat", now);
  res.status(201).json(store.getConversation(id));
});
app.get("/api/conversations/:id/messages", (req, res) => {
  if (!store.getConversation(req.params.id)) return res.status(404).json({ error: "Conversation not found." });
  return res.json(store.getMessages(req.params.id));
});
app.delete("/api/conversations", (_req, res) => { store.clear(); res.status(204).end(); });

app.post("/api/chat", async (req, res) => {
  const { conversationId, text, timeZone } = req.body as { conversationId?: unknown; text?: unknown; timeZone?: unknown };
  if (typeof conversationId !== "string" || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "A conversation and message are required." });
  }
  const conversation = store.getConversation(conversationId);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Add OPENAI_API_KEY to .env and restart the app to enable chat." });

  const userMessage = { id: randomUUID(), conversationId, role: "user" as const, content: text.trim(), citations: [], createdAt: new Date().toISOString() };
  store.addMessage(userMessage);
  if (conversation.title === "New chat") {
    store.db.prepare("UPDATE conversations SET title=? WHERE id=?").run(text.trim().slice(0, 56), conversationId);
  }
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  try {
    const agent = new ChatAgent(createOpenAIClient(process.env.OPENAI_API_KEY), store, process.env.OPENAI_MODEL ?? "gpt-6-astra");
    for await (const event of agent.reply({ conversationId, text: text.trim(), timeZone: typeof timeZone === "string" ? timeZone : "UTC" })) {
      send(event);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The request failed.";
    send({ type: "error", error: message });
  }
  res.end();
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get(/.*/, (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

const server = createServer(app);
server.listen(port, () => console.log(`minimi is ready at http://localhost:${port}`));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { server.close(); store.close(); process.exit(0); });
}

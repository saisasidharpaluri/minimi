import assert from "node:assert/strict";
import test from "node:test";
import { ChatStore, tokenize } from "../server/store.js";

test("messages persist in SQLite and are recallable by full-text terms", () => {
  const store = new ChatStore(":memory:");
  store.createConversation("c1", "Postgres hosting", "2026-11-03T10:00:00.000Z");
  store.addMessage({ id: "m1", conversationId: "c1", role: "user", content: "Compare Postgres hosting prices for a small project", citations: [], createdAt: "2026-11-03T10:01:00.000Z" });
  store.addMessage({ id: "m2", conversationId: "c1", role: "assistant", content: "Neon has a generous free plan and Supabase includes a starter tier.", citations: [{ url: "https://example.com", title: "Example" }], createdAt: "2026-11-03T10:02:00.000Z" });

  assert.equal(store.getMessages("c1").length, 2);
  assert.equal(store.recall("What about Neon Postgres?", undefined)[0]?.id, "m2");
  assert.equal(store.recall("Postgres prices", { from: "2026-11-03T00:00:00.000Z", to: "2026-11-04T00:00:00.000Z" }).length, 2);
  store.close();
});

test("inverted index removes common words and deduplicates terms", () => {
  assert.deepEqual(tokenize("What did I ask about Postgres, Postgres pricing?"), ["postgres", "pricing"]);
});

test("clear history cascades to messages and terms", () => {
  const store = new ChatStore(":memory:");
  store.createConversation("c1", "History");
  store.addMessage({ id: "m1", conversationId: "c1", role: "user", content: "Remember this query", citations: [], createdAt: new Date().toISOString() });
  store.clear();
  assert.equal(store.listConversations().length, 0);
  assert.equal(store.recall("remember query").length, 0);
  store.close();
});

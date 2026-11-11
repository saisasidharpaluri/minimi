import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("history survives closing and reopening the on-disk database", () => {
  const directory = mkdtempSync(join(tmpdir(), "minimi-history-"));
  const path = join(directory, "history.sqlite");
  try {
    const firstRun = new ChatStore(path);
    firstRun.createConversation("persisted", "Old question", "2026-11-03T10:00:00.000Z");
    firstRun.addMessage({ id: "saved", conversationId: "persisted", role: "user", content: "Which Postgres host did we discuss?", citations: [], createdAt: "2026-11-03T10:01:00.000Z" });
    firstRun.close();

    const afterRestart = new ChatStore(path);
    assert.equal(afterRestart.getMessages("persisted")[0]?.content, "Which Postgres host did we discuss?");
    assert.equal(afterRestart.recall("Postgres host")[0]?.id, "saved");
    afterRestart.close();
  } finally {
    for (const suffix of ["", "-shm", "-wal"]) {
      try { unlinkSync(`${path}${suffix}`); } catch { /* SQLite may have already removed sidecar files. */ }
    }
    rmdirSync(directory);
  }
});

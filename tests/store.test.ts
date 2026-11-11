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
    firstRun.addMemory({ id: "answer", conversationId: "persisted", question: "Which Postgres host did we discuss?", answer: "Neon was on the shortlist.", entities: ["Postgres", "Neon"], citations: [{ url: "https://neon.tech/pricing", title: "Neon pricing", startIndex: 0, endIndex: 4 }], createdAt: "2026-11-03T10:02:00.000Z" });
    firstRun.close();

    const afterRestart = new ChatStore(path);
    assert.equal(afterRestart.getMessages("persisted")[0]?.content, "Which Postgres host did we discuss?");
    assert.equal(afterRestart.recall("Postgres host")[0]?.id, "saved");
    assert.equal(afterRestart.recallMemories("Neon pricing")[0]?.citations[0]?.url, "https://neon.tech/pricing");
    afterRestart.close();
  } finally {
    for (const suffix of ["", "-shm", "-wal"]) {
      try { unlinkSync(`${path}${suffix}`); } catch { /* SQLite may have already removed sidecar files. */ }
    }
    rmdirSync(directory);
  }
});

test("structured memories retain entities, exact claims, and provenance", () => {
  const store = new ChatStore(":memory:");
  store.createConversation("c1", "CRM options");
  store.addMemory({ id: "turn-1", conversationId: "c1", question: "Compare HubSpot and Pipedrive for sales", answer: "Pipedrive had a lower entry price in this comparison.", entities: ["HubSpot", "Pipedrive"], citations: [{ url: "https://www.pipedrive.com/pricing", title: "Pipedrive pricing" }], createdAt: "2026-11-03T10:00:00.000Z" });
  const recalled = store.recallMemories("Has Pipedrive changed pricing?", undefined, 2)[0];
  assert.equal(recalled?.question, "Compare HubSpot and Pipedrive for sales");
  assert.equal(recalled?.answer, "Pipedrive had a lower entry price in this comparison.");
  assert.deepEqual(recalled?.entities, ["HubSpot", "Pipedrive"]);
  assert.equal(recalled?.citations[0]?.title, "Pipedrive pricing");
  store.close();
});

test("date-scoped recall ranks matching products above other memories from the same day", () => {
  const store = new ChatStore(":memory:");
  store.createConversation("crm", "CRM");
  store.createConversation("db", "Database");
  store.addMemory({ id: "crm-turn", conversationId: "crm", question: "Compare HubSpot and Pipedrive", answer: "CRM shortlist", entities: ["HubSpot", "Pipedrive"], citations: [], createdAt: "2026-11-10T08:00:00.000Z" });
  store.addMemory({ id: "db-turn", conversationId: "db", question: "Compare Neon and Supabase for Postgres hosting", answer: "Postgres shortlist", entities: ["Neon", "Supabase", "Postgres"], citations: [], createdAt: "2026-11-10T09:00:00.000Z" });
  assert.equal(store.recallMemories("What did I ask last Tuesday about Postgres?", { from: "2026-11-10T00:00:00.000Z", to: "2026-11-11T00:00:00.000Z" })[0]?.id, "db-turn");
  store.close();
});

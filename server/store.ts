import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Role = "user" | "assistant";
export interface Citation { url: string; title: string; startIndex?: number; endIndex?: number }
export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  citations: Citation[];
  createdAt: string;
}
export interface Conversation { id: string; title: string; createdAt: string; updatedAt: string }
export interface MemoryItem {
  id: string;
  conversationId: string;
  question: string;
  answer: string;
  entities: string[];
  citations: Citation[];
  createdAt: string;
}

const stopWords = new Set("a an and are as at be been but by can did do for from had has have how i in is it of on or our that the their them then there these they this to was we were what when where which who why with you your since ask asked about".split(" "));
export function tokenize(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((word) => !stopWords.has(word)))];
}

export class ChatStore {
  readonly db: DatabaseSync;
  constructor(path = "data/minimi.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
        citations TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_conversation_date ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS messages_date ON messages(created_at);
      CREATE TABLE IF NOT EXISTS message_terms (
        term TEXT NOT NULL, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        PRIMARY KEY(term, message_id)
      );
      CREATE INDEX IF NOT EXISTS message_terms_message ON message_terms(message_id);
      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        question TEXT NOT NULL, answer TEXT NOT NULL, entities TEXT NOT NULL,
        citations TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memories_conversation_date ON memory_items(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS memories_date ON memory_items(created_at);
      CREATE TABLE IF NOT EXISTS memory_terms (
        term TEXT NOT NULL, memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
        PRIMARY KEY(term, memory_id)
      );
      CREATE INDEX IF NOT EXISTS memory_terms_memory ON memory_terms(memory_id);
    `);
    this.backfillMemories();
  }

  listConversations(): Conversation[] {
    return this.db.prepare("SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM conversations ORDER BY updated_at DESC").all() as unknown as Conversation[];
  }

  getConversation(id: string): Conversation | null {
    return (this.db.prepare("SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE id=?").get(id) as unknown as Conversation | undefined) ?? null;
  }

  getMessages(id: string): Message[] {
    return (this.db.prepare("SELECT id, conversation_id AS conversationId, role, content, citations, created_at AS createdAt FROM messages WHERE conversation_id=? ORDER BY created_at").all(id) as unknown as Array<Message & { citations: string }>).map((row) => ({ ...row, citations: JSON.parse(row.citations) as Citation[] }));
  }

  createConversation(id: string, title: string, now = new Date().toISOString()): void {
    this.db.prepare("INSERT INTO conversations(id,title,created_at,updated_at) VALUES(?,?,?,?)").run(id, title.slice(0, 80) || "New chat", now, now);
  }

  addMessage(message: Message): void {
    const insert = this.db.prepare("INSERT INTO messages(id,conversation_id,role,content,citations,created_at) VALUES(?,?,?,?,?,?)");
    const index = this.db.prepare("INSERT OR IGNORE INTO message_terms(term,message_id) VALUES(?,?)");
    this.db.exec("BEGIN");
    try {
      insert.run(message.id, message.conversationId, message.role, message.content, JSON.stringify(message.citations), message.createdAt);
      for (const term of tokenize(message.content)) index.run(term, message.id);
      this.db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(message.createdAt, message.conversationId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  addMemory(item: MemoryItem): void {
    const insert = this.db.prepare("INSERT OR REPLACE INTO memory_items(id,conversation_id,question,answer,entities,citations,created_at) VALUES(?,?,?,?,?,?,?)");
    const index = this.db.prepare("INSERT OR IGNORE INTO memory_terms(term,memory_id) VALUES(?,?)");
    this.db.exec("BEGIN");
    try {
      insert.run(item.id, item.conversationId, item.question, item.answer, JSON.stringify(item.entities), JSON.stringify(item.citations), item.createdAt);
      this.db.prepare("DELETE FROM memory_terms WHERE memory_id=?").run(item.id);
      const allTerms = new Set([...tokenize(item.question), ...tokenize(item.answer), ...item.entities.flatMap(tokenize)]);
      for (const term of allTerms) index.run(term, item.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  recallMemories(query: string, date?: { from: string; to: string }, limit = 6): MemoryItem[] {
    const terms = tokenize(query);
    let rows: Array<MemoryItem & { entities: string; citations: string }>;
    if (date) {
      if (terms.length) {
        const placeholders = terms.map(() => "?").join(",");
        rows = this.db.prepare(`
          SELECT m.id, m.conversation_id AS conversationId, m.question, m.answer, m.entities, m.citations, m.created_at AS createdAt,
            SUM(CASE WHEN t.term IN (${placeholders}) THEN 1 ELSE 0 END) AS score
          FROM memory_items m LEFT JOIN memory_terms t ON t.memory_id=m.id
          WHERE m.created_at >= ? AND m.created_at < ?
          GROUP BY m.id ORDER BY score DESC, m.created_at DESC LIMIT ?
        `).all(...terms, date.from, date.to, limit) as unknown as Array<MemoryItem & { entities: string; citations: string }>;
      } else {
        rows = this.db.prepare("SELECT id, conversation_id AS conversationId, question, answer, entities, citations, created_at AS createdAt FROM memory_items WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT ?").all(date.from, date.to, limit) as unknown as Array<MemoryItem & { entities: string; citations: string }>;
      }
    } else if (terms.length) {
      const placeholders = terms.map(() => "?").join(",");
      rows = this.db.prepare(`
        SELECT m.id, m.conversation_id AS conversationId, m.question, m.answer, m.entities, m.citations, m.created_at AS createdAt,
          COUNT(*) AS score
        FROM memory_terms t JOIN memory_items m ON m.id=t.memory_id
        WHERE t.term IN (${placeholders})
        GROUP BY m.id ORDER BY score DESC, m.created_at DESC LIMIT ?
      `).all(...terms, limit) as unknown as Array<MemoryItem & { entities: string; citations: string }>;
    } else return [];
    return rows.map((row) => ({ ...row, entities: JSON.parse(row.entities) as string[], citations: JSON.parse(row.citations) as Citation[] }));
  }

  private backfillMemories(): void {
    const assistants = this.db.prepare(`
      SELECT a.id, a.conversation_id AS conversationId, a.content AS answer, a.citations, a.created_at AS createdAt,
        (SELECT u.id FROM messages u WHERE u.conversation_id=a.conversation_id AND u.role='user' AND u.created_at<=a.created_at ORDER BY u.created_at DESC LIMIT 1) AS userId,
        (SELECT u.content FROM messages u WHERE u.conversation_id=a.conversation_id AND u.role='user' AND u.created_at<=a.created_at ORDER BY u.created_at DESC LIMIT 1) AS question
      FROM messages a LEFT JOIN memory_items m ON m.id=a.id
      WHERE a.role='assistant' AND m.id IS NULL
    `).all() as Array<{ id: string; conversationId: string; answer: string; citations: string; createdAt: string; userId: string | null; question: string | null }>;
    for (const row of assistants) {
      if (!row.userId || !row.question) continue;
      this.addMemory({ id: row.id, conversationId: row.conversationId, question: row.question, answer: row.answer,
        entities: extractEntities(`${row.question}\n${row.answer}`), citations: JSON.parse(row.citations) as Citation[], createdAt: row.createdAt });
    }
  }

  recall(query: string, date?: { from: string; to: string }, limit = 8): Message[] {
    const terms = tokenize(query);
    let rows: Array<Message & { citations: string }>;
    if (date) {
      rows = this.db.prepare("SELECT id, conversation_id AS conversationId, role, content, citations, created_at AS createdAt FROM messages WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT ?").all(date.from, date.to, limit) as unknown as Array<Message & { citations: string }>;
    } else if (terms.length) {
      const placeholders = terms.map(() => "?").join(",");
      rows = this.db.prepare(`
        SELECT m.id, m.conversation_id AS conversationId, m.role, m.content, m.citations, m.created_at AS createdAt,
          COUNT(*) AS score
        FROM message_terms t JOIN messages m ON m.id=t.message_id
        WHERE t.term IN (${placeholders})
        GROUP BY m.id ORDER BY score DESC, m.created_at DESC LIMIT ?
      `).all(...terms, limit) as unknown as Array<Message & { citations: string }>;
    } else return [];
    return rows.map((row) => ({ ...row, citations: JSON.parse(row.citations) as Citation[] }));
  }

  clear(): void { this.db.exec("DELETE FROM conversations"); }
  close(): void { this.db.close(); }
}

const nonEntities = new Set("a an the what which when where why how who did has have can could would should on last this that then there we i it they he she compare tell check minimi".split(" "));
export function extractEntities(text: string): string[] {
  const candidates = text.match(/\b[A-Z][\p{L}\p{N}+#.-]*(?:\s+[A-Z][\p{L}\p{N}+#.-]*)*/gu) ?? [];
  return [...new Set(candidates.map((value) => value.replace(/[.,;:!?]+$/g, "").trim())
    .filter((value) => value.length > 1 && !nonEntities.has(value.toLowerCase())))].slice(0, 12);
}

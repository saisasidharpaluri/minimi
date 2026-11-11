import assert from "node:assert/strict";
import test from "node:test";
import { ChatAgent, extractCitations, type ResponsesClient } from "../server/agent.js";
import { ChatStore } from "../server/store.js";

function fixtureClient(answer: string, citations: Array<{ url: string; title: string }> = [], capture?: (input: Record<string, unknown>) => void): ResponsesClient {
  return {
    responses: {
      async create(input) {
        capture?.(input);
        const response = {
          output: [{ type: "message", content: [{ type: "output_text", text: answer, annotations: citations.map((citation) => ({ type: "url_citation", ...citation })) }] }],
        };
        return (async function* () {
          yield { type: "response.output_text.delta", delta: answer };
          yield { type: "response.completed", response };
        })();
      },
    },
  };
}

async function run(agent: ChatAgent, conversationId: string, text: string) {
  const events = [];
  for await (const event of agent.reply({ conversationId, text, timeZone: "UTC" })) events.push(event);
  return events;
}

test("ordinary chat streams and persists a concise answer", async () => {
  const store = new ChatStore(":memory:");
  store.createConversation("c1", "Question");
  const agent = new ChatAgent(fixtureClient("A concise answer."), store, "gpt-6-astra");
  const events = await run(agent, "c1", "Explain what a database index does.");
  assert.deepEqual(events.map((event) => event.type), ["delta", "complete"]);
  assert.equal(store.getMessages("c1").at(-1)?.content, "A concise answer.");
  store.close();
});

test("dated recall passes the exact earlier question into model context", async () => {
  const store = new ChatStore(":memory:");
  store.createConversation("c1", "CRM");
  store.addMessage({ id: "q", conversationId: "c1", role: "user", content: "Which CRM has transparent pricing?", citations: [], createdAt: "2026-11-03T09:00:00.000Z" });
  store.addMessage({ id: "a", conversationId: "c1", role: "assistant", content: "HubSpot was on the shortlist.", citations: [], createdAt: "2026-11-03T09:01:00.000Z" });
  let captured: Record<string, unknown> | undefined;
  const agent = new ChatAgent(fixtureClient("You asked which CRM had transparent pricing.", [], (input) => { captured = input; }), store, "gpt-6-astra", () => new Date("2026-11-10T12:00:00.000Z"));
  await run(agent, "c1", "What did I ask you on 3 November?");
  assert.match(String(captured?.input), /Which CRM has transparent pricing/);
  assert.match(String(captured?.input), /2026-11-03/);
  store.close();
});

test("follow-up retains shortlisted products and returns fresh citations", async () => {
  const store = new ChatStore(":memory:");
  store.createConversation("c1", "CRM pricing");
  store.addMessage({ id: "q", conversationId: "c1", role: "user", content: "Compare HubSpot and Pipedrive CRM for a 20-person sales team", citations: [], createdAt: "2026-11-03T09:00:00.000Z" });
  store.addMessage({ id: "a", conversationId: "c1", role: "assistant", content: "Both were shortlisted; compare their plans.", citations: [], createdAt: "2026-11-03T09:01:00.000Z" });
  let captured: Record<string, unknown> | undefined;
  const client = fixtureClient("Pipedrive's current plan details are here [source].", [{ url: "https://www.pipedrive.com/pricing", title: "Pipedrive pricing" }], (input) => { captured = input; });
  const agent = new ChatAgent(client, store, "gpt-6-astra");
  const events = await run(agent, "c1", "Have any of them changed pricing since then?");
  assert.match(String(captured?.input), /HubSpot and Pipedrive/);
  assert.deepEqual(events.at(-1)?.citations, [{ url: "https://www.pipedrive.com/pricing", title: "Pipedrive pricing" }]);
  assert.equal(store.getMessages("c1").at(-1)?.citations[0]?.url, "https://www.pipedrive.com/pricing");
  store.close();
});

test("citation extraction ignores invalid URLs and deduplicates sources", () => {
  const citations = extractCitations({ output: [{ type: "message", content: [{ annotations: [
    { type: "url_citation", url: "https://example.com/a", title: "Example" },
    { type: "url_citation", url: "https://example.com/a", title: "Duplicate" },
    { type: "url_citation", url: "javascript:alert(1)", title: "Bad" },
  ] }] }] });
  assert.deepEqual(citations, [{ url: "https://example.com/a", title: "Example" }]);
});

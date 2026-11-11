import { ChatStore, extractEntities } from "../server/store.js";
import { interpretDateQuery, utcRangeForLocalDates } from "../server/dates.js";

const histories = [
  { id: "crm", date: "2026-11-03", question: "We shortlisted HubSpot and Pipedrive CRM for a 20-person sales team.", answer: "HubSpot and Pipedrive were the shortlisted CRM options for the sales team.", entities: ["HubSpot", "Pipedrive"] },
  { id: "postgres", date: "2026-11-04", question: "Compare Neon, Supabase, and Railway for Postgres hosting.", answer: "Neon, Supabase, and Railway were compared for hosted Postgres.", entities: ["Neon", "Supabase", "Railway", "Postgres"] },
  { id: "ai-coding", date: "2026-11-05", question: "We compared Cursor and GitHub Copilot for an engineering team.", answer: "Cursor and GitHub Copilot were the coding assistant shortlist.", entities: ["Cursor", "GitHub Copilot"] },
  { id: "project-tools", date: "2026-11-06", question: "Compare Linear and Asana for project tracking.", answer: "Linear and Asana were the project management options.", entities: ["Linear", "Asana"] },
  { id: "design-tools", date: "2026-11-07", question: "We reviewed Figma and Penpot for product design.", answer: "Figma and Penpot were compared for product design workflows.", entities: ["Figma", "Penpot"] },
  { id: "hosting", date: "2026-11-08", question: "We compared Vercel and Netlify for hosting the marketing site.", answer: "Vercel and Netlify were the site hosting shortlist.", entities: ["Vercel", "Netlify"] },
  { id: "email", date: "2026-11-09", question: "We compared Resend and Postmark for transactional email.", answer: "Resend and Postmark were the transactional email services.", entities: ["Resend", "Postmark"] },
  { id: "analytics", date: "2026-11-10", question: "We compared PostHog and Amplitude for product analytics.", answer: "PostHog and Amplitude were the analytics options.", entities: ["PostHog", "Amplitude"] },
  { id: "crm-alt", date: "2026-11-10", question: "We compared Salesforce and Zoho CRM pricing for a small team.", answer: "Salesforce and Zoho were considered for small-team CRM pricing.", entities: ["Salesforce", "Zoho"] },
  { id: "search", date: "2026-11-11", question: "We reviewed Perplexity and You.com for AI web search.", answer: "Perplexity and You.com were the AI search products reviewed.", entities: ["Perplexity", "You.com"] },
] as const;

const queries = [
  ["Which sales CRM tools did we shortlist?", "crm"],
  ["On 3 November, what were the CRM choices?", "crm"],
  ["Have HubSpot or Pipedrive changed their pricing since the shortlist?", "crm"],
  ["Which Postgres hosting providers did we compare?", "postgres"],
  ["What did I ask on 4 November about database hosting?", "postgres"],
  ["Have Neon, Supabase, or Railway changed their plans?", "postgres"],
  ["Which coding assistants were on the engineering shortlist?", "ai-coding"],
  ["What did I ask on 5 November?", "ai-coding"],
  ["Has Cursor or GitHub Copilot shipped anything since we compared them?", "ai-coding"],
  ["Which project tracking products did we compare?", "project-tools"],
  ["What did I ask on 6 November about project planning?", "project-tools"],
  ["Have Linear or Asana changed their pricing since then?", "project-tools"],
  ["Which design tools were reviewed for product work?", "design-tools"],
  ["What was my question on 7 November?", "design-tools"],
  ["Has Penpot or Figma added anything significant?", "design-tools"],
  ["Which site hosts were shortlisted for the marketing website?", "hosting"],
  ["What did I ask on 8 November about web hosting?", "hosting"],
  ["Have Netlify or Vercel changed their plans?", "hosting"],
  ["Which transactional email services did we evaluate?", "email"],
  ["What did I ask on 9 November?", "email"],
  ["Have Postmark or Resend changed pricing since our comparison?", "email"],
  ["Which product analytics platforms were compared?", "analytics"],
  ["What did I ask you last Tuesday about analytics?", "analytics"],
  ["Has PostHog or Amplitude shipped anything big since then?", "analytics"],
  ["Which CRM providers did we consider for a smaller sales team?", "crm-alt"],
  ["What did I ask last Tuesday about CRM pricing?", "crm-alt"],
  ["Did Salesforce or Zoho change their plans since we checked?", "crm-alt"],
  ["Which AI web search products did we review?", "search"],
  ["What did I ask on 11 November?", "search"],
  ["Have Perplexity or You.com changed their product or pricing?", "search"],
] as const;

const store = new ChatStore(":memory:");
for (const history of histories) {
  store.createConversation(history.id, history.question, `${history.date}T12:00:00.000Z`);
  store.addMemory({
    id: history.id,
    conversationId: history.id,
    question: history.question,
    answer: history.answer,
    entities: [...history.entities, ...extractEntities(`${history.question}\n${history.answer}`)],
    citations: [],
    createdAt: `${history.date}T12:01:00.000Z`,
  });
}

const now = new Date("2026-11-11T12:00:00.000Z");
let hits = 0;
let dateCases = 0;
let dateHits = 0;
const misses: string[] = [];
for (const [query, expectedId] of queries) {
  const date = interpretDateQuery(query, now, "UTC");
  const range = date ? utcRangeForLocalDates(date.from, date.to, "UTC") : undefined;
  if (date) dateCases++;
  const results = store.recallMemories(query, range, 6);
  if (results.some((item) => item.id === expectedId)) {
    hits++;
    if (date) dateHits++;
  } else misses.push(`${expectedId}: ${query}`);
}
const summary = {
  cases: queries.length,
  recallAt6: Number((hits / queries.length).toFixed(3)),
  dateCases,
  exactDateRecall: dateCases ? Number((dateHits / dateCases).toFixed(3)) : 1,
  misses,
};
console.log(JSON.stringify(summary, null, 2));
store.close();
if (hits !== queries.length) process.exitCode = 1;

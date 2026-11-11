import { Icon } from "./Icon.js";

const prompts = [
  { number: "01", title: "What changed?", description: "Revisit a shortlist and compare it with today.", prompt: "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?", icon: "arrow-right" as const, tone: "sage" },
  { number: "02", title: "Check your memory", description: "Find an old question and verify it again.", prompt: "What did I ask you on 3 November? Is your answer still correct today?", icon: "search" as const, tone: "blue" },
  { number: "03", title: "Pick up the thread", description: "Continue a past decision with fresh research.", prompt: "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?", icon: "clock" as const, tone: "sand" },
];

export function Welcome({ onPrompt, onWatchDemo }: { onPrompt: (text: string) => void; onWatchDemo: () => void }) {
  return <div className="welcome-view">
    <div className="welcome-kicker"><span className="kicker-rule" /> RESEARCH, REMEMBERED</div>
    <h1>Good research<br /><em>has a memory.</em></h1>
    <p className="welcome-description">Bring a question, a decision, or an old thread. Minimi searches what’s changed and keeps the context close.</p>
    <button className="welcome-demo-button" onClick={onWatchDemo}><span className="play-icon"><Icon name="play" size={13} /></span> Watch the 60-second tour</button>
    <div className="starter-heading"><span>Start with a thread</span><span className="starter-caption">A FEW IDEAS</span></div>
    <div className="starter-grid">
      {prompts.map((item) => <button className="starter-card" key={item.number} onClick={() => onPrompt(item.prompt)}>
        <span className="starter-top"><span className="starter-index">{item.number}</span><span className={`starter-icon ${item.tone}`}><Icon name={item.icon} size={17} /></span></span>
        <span className="starter-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
        <span className="starter-arrow"><Icon name="arrow-right" size={16} /></span>
      </button>)}
    </div>
    <div className="welcome-footnote"><Icon name="globe" size={15} /> Answers can search the live web and cite their sources.</div>
  </div>;
}

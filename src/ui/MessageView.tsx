import ReactMarkdown from "react-markdown";
import type { Citation, Message } from "../../server/store.js";
import { addInlineCitations } from "../shared/citations.js";
import { Icon } from "./Icon.js";

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export function MessageView({ message, streaming = false }: { message: Message; streaming?: boolean }) {
  const isUser = message.role === "user";
  return <article className={`message ${isUser ? "message-user" : "message-assistant"}`}>
    {isUser ? <div className="message-role">YOU <span>{formatTime(message.createdAt)}</span></div> : <div className="assistant-byline"><span className="mini-mark"><Icon name="spark" size={14} /></span><span>MINIMI</span><i /><span>{streaming ? "RESEARCHING" : "RESEARCH NOTE"}</span></div>}
    <div className={isUser ? "message-body user-body" : "message-body assistant-body"}>
      <div className="markdown-content"><ReactMarkdown components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> }}>{addInlineCitations(message.content, message.citations ?? [])}</ReactMarkdown>{streaming && <span className="stream-cursor" aria-label="Response is streaming" />}</div>
    </div>
    {!isUser && !!message.citations?.length && <Sources citations={message.citations} />}
    {!isUser && <time className="assistant-time">{formatTime(message.createdAt)}</time>}
  </article>;
}

function Sources({ citations }: { citations: Citation[] }) {
  return <section className="sources-panel" aria-label="Sources">
    <div className="sources-heading"><span>Sources</span><span className="sources-count">{citations.length} cited</span></div>
    <ol className="source-list">
      {citations.map((citation, index) => <li key={citation.url + index}><a href={citation.url} target="_blank" rel="noreferrer noopener">
        <span className="source-number">{String(index + 1).padStart(2, "0")}</span><span className="source-title">{citation.title || citation.url}</span><Icon name="external" size={14} />
      </a></li>)}
    </ol>
  </section>;
}

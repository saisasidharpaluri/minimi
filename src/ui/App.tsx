import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Citation, Conversation, Message } from "../../server/store.js";
import { addInlineCitations } from "../shared/citations.js";

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
type StreamEvent = { type: "delta" | "complete" | "error"; text?: string; citations?: Citation[]; error?: string };

function dateLabel(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const refreshConversations = useCallback(async () => {
    const response = await fetch("/api/conversations");
    if (!response.ok) throw new Error("Could not load saved chats.");
    setConversations(await response.json() as Conversation[]);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    setActiveId(id);
    localStorage.setItem("minimi.activeConversation", id);
    const response = await fetch(`/api/conversations/${id}/messages`);
    if (!response.ok) throw new Error("Could not load this chat.");
    setMessages(await response.json() as Message[]);
    setError("");
  }, []);

  const newConversation = useCallback(async () => {
    const response = await fetch("/api/conversations", { method: "POST" });
    if (!response.ok) throw new Error("Could not create a new chat.");
    const conversation = await response.json() as Conversation;
    await refreshConversations();
    setMessages([]);
    setActiveId(conversation.id);
    localStorage.setItem("minimi.activeConversation", conversation.id);
    setError("");
    setSidebarOpen(false);
  }, [refreshConversations]);

  useEffect(() => {
    (async () => {
      try {
        const config = await fetch("/api/config").then((r) => r.json()) as { configured: boolean };
        setConfigured(config.configured);
        const list = await fetch("/api/conversations").then((r) => r.json()) as Conversation[];
        setConversations(list);
        const saved = localStorage.getItem("minimi.activeConversation");
        const selected = list.find((item) => item.id === saved) ?? list[0];
        if (selected) await loadMessages(selected.id);
        else await newConversation();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to start the app.");
      } finally { setReady(true); }
    })();
  }, [loadMessages, newConversation]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamText]);
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || !activeId) return;
    setDraft("");
    setError("");
    setBusy(true);
    setStreamText("");
    const localUser: Message = { id: crypto.randomUUID(), conversationId: activeId, role: "user", content: text, citations: [], createdAt: new Date().toISOString() };
    setMessages((current) => [...current, localUser]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, text, timeZone: tz }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "The chat request failed.");
      }
      if (!response.body) throw new Error("The server did not start a response stream.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let completed = false;
      let citations: Citation[] = [];
      let failed = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((part) => part.startsWith("data: "));
          if (!line) continue;
          const message = JSON.parse(line.slice(6)) as StreamEvent;
          if (message.type === "delta") {
            answer += message.text ?? "";
            setStreamText(answer);
          } else if (message.type === "complete") {
            answer = message.text ?? answer;
            citations = message.citations ?? [];
            completed = true;
          } else if (message.type === "error") failed = message.error ?? "The response failed.";
        }
        if (done) break;
      }
      if (failed) throw new Error(failed);
      if (!completed || !answer) throw new Error(answer ? "The connection ended before the answer completed. Try again." : "The model returned an empty answer.");
      const assistant: Message = { id: crypto.randomUUID(), conversationId: activeId, role: "assistant", content: answer, citations, createdAt: new Date().toISOString() };
      setMessages((current) => [...current, assistant]);
      setStreamText("");
      await refreshConversations();
    } catch (err) {
      setStreamText("");
      setError(err instanceof Error ? err.message : "The response failed. Your message is saved; you can try again.");
    } finally { setBusy(false); }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  }

  async function clearHistory() {
    if (!window.confirm("Delete every saved conversation from this device? This cannot be undone.")) return;
    await fetch("/api/conversations", { method: "DELETE" });
    setConversations([]);
    localStorage.removeItem("minimi.activeConversation");
    await newConversation();
  }

  return <div className="shell">
    <div className={`scrim ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} />
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark">m</span><span>minimi</span><span className="brand-note">research, remembered</span></div>
      <button className="new-chat" onClick={() => void newConversation()}><span>＋</span> New chat <kbd>⌘ K</kbd></button>
      <div className="history-heading">YOUR HISTORY</div>
      <nav className="history-list" aria-label="Saved conversations">
        {conversations.map((item) => <button key={item.id} className={`history-item ${item.id === activeId ? "selected" : ""}`} onClick={() => { void loadMessages(item.id); setSidebarOpen(false); }} title={item.title}>
          <span className="history-icon">◷</span><span className="history-title">{item.title}</span>
        </button>)}
        {!conversations.length && <p className="history-empty">Your conversations will appear here.</p>}
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-note"><span className="lock">⌑</span><span>Private by default<br /><small>History stays on this device.</small></span></div>
        <button className="clear-button" onClick={() => void clearHistory()} disabled={!conversations.length || busy}>Clear history</button>
      </div>
    </aside>

    <main className="main-pane">
      <header className="topbar"><button className="mobile-menu" aria-label="Open history" onClick={() => setSidebarOpen(true)}>☰</button><div className="mobile-brand">minimi</div><div className="topbar-status"><span className="status-dot" /> Web search ready</div><button className="topbar-new" onClick={() => void newConversation()}>＋ <span>New chat</span></button></header>
      <section className={`conversation ${messages.length ? "has-messages" : ""}`}>
        {!messages.length && !streamText ? <div className="welcome">
          <div className="eyebrow"><span className="sparkle">✳</span> YOUR THOUGHTFUL RESEARCH PARTNER</div>
          <h1>Pick up where<br /><em>the world left off.</em></h1>
          <p className="welcome-copy">Ask anything. Minimi searches the web for what’s true now — and remembers what mattered before.</p>
          <div className="prompt-grid">
            <button onClick={() => setDraft("On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?")}><span className="prompt-icon mint">↗</span><span><strong>What’s changed?</strong><small>Revisit an earlier shortlist with fresh research.</small></span><span className="prompt-arrow">↗</span></button>
            <button onClick={() => setDraft("What did I ask you on 3 November? Is your answer still correct today?")}><span className="prompt-icon lilac">⌕</span><span><strong>Check your memory</strong><small>Find an old question and check it again.</small></span><span className="prompt-arrow">↗</span></button>
            <button onClick={() => setDraft("Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?")}><span className="prompt-icon peach">◷</span><span><strong>Catch me up</strong><small>Check what’s changed since last time.</small></span><span className="prompt-arrow">↗</span></button>
          </div>
        </div> : <div className="messages" aria-live="polite">
          {messages.map((message) => <MessageView key={message.id} message={message} />)}
          {streamText && <MessageView message={{ id: "stream", role: "assistant", content: streamText, citations: [], createdAt: new Date().toISOString(), conversationId: activeId ?? "" }} streaming />}
          {busy && !streamText && <div className="thinking"><span className="thinking-mark">✳</span><span>Looking into it</span><span className="typing"><i /><i /><i /></span></div>}
          <div ref={bottom} />
        </div>}
      </section>
      <div className="composer-wrap">
        {!configured && <div className="setup-hint">Add your OpenAI key to <code>.env</code> to start chatting.</div>}
        {error && <div className="error-banner" role="alert"><span>Something went wrong</span><p>{error}</p><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
        <form className="composer" onSubmit={(event) => void sendMessage(event)}>
          <textarea ref={textarea} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Ask a question, or pick up an old thread…" rows={1} aria-label="Message minimi" disabled={!ready || !configured || busy} />
          <div className="composer-footer"><span className="composer-hint"><span className="search-glyph">⌕</span> Search the web <span className="separator">·</span> Remember the context</span><div className="send-cluster"><span className="enter-hint">↵ to send</span><button className="send-button" type="submit" disabled={!draft.trim() || busy || !configured} aria-label="Send message">↑</button></div></div>
        </form>
        <p className="footer-note">Minimi can make mistakes. Check important details against the sources.</p>
      </div>
    </main>
  </div>;
}

function MessageView({ message, streaming = false }: { message: Message; streaming?: boolean }) {
  const user = message.role === "user";
  return <article className={`message-row ${user ? "user-row" : "assistant-row"}`}>
    {!user && <div className="assistant-avatar">m</div>}
    <div className="message-content">
      {!user && <div className="message-label">MINIMI <span>·</span> {streaming ? "THINKING" : "RESEARCH PARTNER"}</div>}
      <div className={`bubble ${user ? "user-bubble" : "assistant-bubble"}`}>
        <ReactMarkdown components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> }}>{addInlineCitations(message.content, message.citations ?? [])}</ReactMarkdown>
        {streaming && <span className="cursor" />}
      </div>
      {!!message.citations?.length && <div className="sources"><div className="sources-label"><span>↗</span> SOURCES</div><div className="source-list">{message.citations.map((citation, index) => <a key={`${citation.url}-${index}`} href={citation.url} target="_blank" rel="noreferrer noopener"><span className="source-number">{index + 1}</span><span>{citation.title || citation.url}</span><span className="external">↗</span></a>)}</div></div>}
      <time className="message-time">{dateLabel(message.createdAt)}</time>
    </div>
  </article>;
}

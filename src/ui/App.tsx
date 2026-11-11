import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Conversation, Message } from "../../server/store.js";
import { Composer } from "./Composer.js";
import { HistorySidebar } from "./HistorySidebar.js";
import { Icon } from "./Icon.js";
import { MessageView } from "./MessageView.js";
import { Welcome } from "./Welcome.js";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
type StreamEvent = { type: "delta" | "complete" | "error"; text?: string; citations?: Message["citations"]; error?: string };

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("New conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startedRef = useRef(false);

  const refreshConversations = useCallback(async () => {
    const response = await fetch("/api/conversations");
    if (!response.ok) throw new Error("Could not load your conversation library.");
    const list = await response.json() as Conversation[];
    setConversations(list);
    return list;
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const response = await fetch("/api/conversations/" + encodeURIComponent(id) + "/messages");
    if (!response.ok) throw new Error("Could not load this conversation.");
    const selected = conversations.find((item) => item.id === id);
    setActiveId(id);
    setActiveTitle(selected?.title ?? "Conversation");
    localStorage.setItem("minimi.activeConversation", id);
    setMessages(await response.json() as Message[]);
    setError("");
    setDrawerOpen(false);
  }, [conversations]);

  const newConversation = useCallback(async () => {
    const response = await fetch("/api/conversations", { method: "POST" });
    if (!response.ok) throw new Error("Could not create a new conversation.");
    const conversation = await response.json() as Conversation;
    setConversations((current) => [conversation, ...current]);
    setMessages([]);
    setActiveId(conversation.id);
    setActiveTitle(conversation.title);
    localStorage.setItem("minimi.activeConversation", conversation.id);
    setError("");
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    // Prevent StrictMode's development effect replay from creating two blank chats.
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      try {
        const [configResponse, listResponse] = await Promise.all([fetch("/api/config"), fetch("/api/conversations")]);
        if (!configResponse.ok || !listResponse.ok) throw new Error("Minimi could not connect to its local server.");
        const config = await configResponse.json() as { configured: boolean };
        const list = await listResponse.json() as Conversation[];
        setConfigured(Boolean(config.configured));
        setConversations(list);
        const savedId = localStorage.getItem("minimi.activeConversation");
        const selected = list.find((item) => item.id === savedId) ?? list[0];
        if (selected) {
          const response = await fetch("/api/conversations/" + encodeURIComponent(selected.id) + "/messages");
          if (!response.ok) throw new Error("Could not open your last conversation.");
          setActiveId(selected.id);
          setActiveTitle(selected.title);
          setMessages(await response.json() as Message[]);
        } else {
          await newConversation();
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to start Minimi.");
      } finally {
        setReady(true);
      }
    })();
  }, [newConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streamText ? "smooth" : "auto", block: "end" });
  }, [messages, streamText]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [draft]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!busy) void newConversation();
      }
      if (event.key === "Escape") { setDrawerOpen(false); setConfirmClear(false); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, newConversation]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || !activeId || !configured) return;
    setDraft("");
    setError("");
    setBusy(true);
    setStreamText("");
    const conversationId = activeId;
    setMessages((current) => [...current, { id: crypto.randomUUID(), conversationId, role: "user", content: text, citations: [], createdAt: new Date().toISOString() }]);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, text, timeZone }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "The chat request failed.");
      }
      if (!response.body) throw new Error("The server did not start a response stream.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let citations: Message["citations"] = [];
      let completed = false;
      let streamError = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((part) => part.startsWith("data: "));
          if (!line) continue;
          const item = JSON.parse(line.slice(6)) as StreamEvent;
          if (item.type === "delta") { answer += item.text ?? ""; setStreamText(answer); }
          else if (item.type === "complete") { answer = item.text ?? answer; citations = item.citations ?? []; completed = true; }
          else if (item.type === "error") streamError = item.error ?? "The response failed.";
        }
        if (done) break;
      }
      if (streamError) throw new Error(streamError);
      if (!completed || !answer) throw new Error("The response ended before Minimi completed it. Please try again.");
      const assistantMessage: Message = { id: crypto.randomUUID(), conversationId, role: "assistant", content: answer, citations, createdAt: new Date().toISOString() };
      setMessages((current) => [...current, assistantMessage]);
      setStreamText("");
      const updated = await refreshConversations();
      const current = updated.find((conversation) => conversation.id === conversationId);
      if (current) setActiveTitle(current.title);
    } catch (caught) {
      setStreamText("");
      setError(caught instanceof Error ? caught.message : "The response failed. Your message remains in this view; you can try again.");
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    setConfirmClear(false);
    try {
      const response = await fetch("/api/conversations", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear conversation history.");
      setConversations([]);
      setMessages([]);
      setActiveId(null);
      setActiveTitle("New conversation");
      localStorage.removeItem("minimi.activeConversation");
      await newConversation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not clear history.");
    }
  }

  function choosePrompt(text: string) { setDraft(text); textareaRef.current?.focus(); }
  const hasMessages = messages.length > 0 || streamText.length > 0;

  return <div className="app-shell">
    <HistorySidebar conversations={conversations} activeId={activeId} open={drawerOpen} onClose={() => setDrawerOpen(false)} onNewChat={() => void newConversation()} onSelect={(id) => void loadMessages(id)} onClear={() => setConfirmClear(true)} clearingAvailable={conversations.length > 0 && !busy} />
    <main className="main-area">
      <header className="topbar">
        <button className="topbar-menu icon-button" onClick={() => setDrawerOpen(true)} aria-label="Open conversation history" aria-expanded={drawerOpen}><Icon name="menu" /></button>
        <div className="topbar-context"><span className="workspace-label">MINIMI / WORKSPACE</span><span className="active-title">{activeTitle}</span></div>
        <div className={`connection-state ${configured ? "is-ready" : "is-setup-needed"}`} role="status"><span className="connection-dot" /><span>{configured ? "Web search ready" : "Setup needed"}</span></div>
        <button className="topbar-new-chat" onClick={() => void newConversation()} disabled={!ready || busy}><Icon name="plus" size={16} /><span>New chat</span></button>
      </header>

      {!ready && <div className="startup-state" role="status"><span className="loading-orbit" /><p>Opening your workspace…</p></div>}
      {ready && error && !hasMessages && <div className="startup-error" role="alert"><span className="error-mark">!</span><h1>We couldn’t open Minimi.</h1><p>{error}</p><button className="secondary-button" onClick={() => window.location.reload()}>Try again</button></div>}
      {ready && !(error && !hasMessages) && <section className={`conversation-view ${hasMessages ? "has-messages" : "is-empty"}`} aria-label="Conversation">
        {!hasMessages ? <Welcome onPrompt={choosePrompt} /> : <div className="message-list" aria-live="polite">
          {messages.map((message) => <MessageView key={message.id} message={message} />)}
          {streamText && <MessageView message={{ id: "stream", role: "assistant", content: streamText, citations: [], createdAt: new Date().toISOString(), conversationId: activeId ?? "" }} streaming />}
          {busy && !streamText && <div className="researching-state"><span className="mini-mark"><Icon name="spark" size={14} /></span><span>Gathering context and checking the web</span><span className="typing-dots"><i /><i /><i /></span></div>}
          <div ref={bottomRef} />
        </div>}
      </section>}

      <div className="composer-dock">
        {error && hasMessages && <div className="error-message" role="alert"><span className="error-mark">!</span><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}
        <Composer value={draft} ready={ready} configured={configured} busy={busy} textareaRef={textareaRef} onChange={setDraft} onSubmit={(event) => void sendMessage(event)} />
      </div>
    </main>

    {confirmClear && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmClear(false); }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description">
        <span className="dialog-icon"><Icon name="trash" size={19} /></span><h2 id="clear-title">Clear your library?</h2><p id="clear-description">This permanently deletes every conversation saved on this device.</p>
        <div className="dialog-actions"><button className="secondary-button" onClick={() => setConfirmClear(false)}>Keep history</button><button className="danger-button" onClick={() => void clearHistory()}>Delete all</button></div>
      </section>
    </div>}
  </div>;
}

import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { Icon } from "./Icon.js";

type Props = {
  value: string;
  ready: boolean;
  configured: boolean;
  busy: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
};

export function Composer({ value, ready, configured, busy, textareaRef, onChange, onSubmit }: Props) {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); }
  }
  return <div className="composer-region">
    {!configured && <div className="setup-card" role="status">
      <span className="setup-icon"><Icon name="lock" size={16} /></span>
      <span><strong>Connect your model to start chatting</strong><small>Add <code>OPENAI_API_KEY</code> to your local <code>.env</code> file, then restart Minimi. Your key stays on this device.</small></span>
    </div>}
    <form className="composer" onSubmit={(event) => onSubmit(event)}>
      <label className="sr-only" htmlFor="message-input">Message Minimi</label>
      <textarea id="message-input" ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder={configured ? "Ask a question or continue an earlier thread…" : "Your message will go here"} rows={1} disabled={!ready || !configured || busy} />
      <div className="composer-toolbar">
        <div className="composer-capabilities"><span><Icon name="search" size={15} /> Web search</span><i /><span>Conversation memory</span></div>
        <div className="composer-actions"><span className="keyboard-hint"><kbd>Enter</kbd> to send</span><button className="send-button" type="submit" disabled={!value.trim() || busy || !ready || !configured} aria-label="Send message"><Icon name="arrow-up" size={19} /></button></div>
      </div>
    </form>
    <p className="composer-disclaimer">Minimi can make mistakes. Verify important details with the linked sources.</p>
  </div>;
}

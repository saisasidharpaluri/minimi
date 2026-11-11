import type { Conversation } from "../../server/store.js";
import { Icon } from "./Icon.js";

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onClear: () => void;
  clearingAvailable: boolean;
};

function groupConversations(items: Conversation[]): Array<[string, Conversation[]]> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const groups = new Map<string, Conversation[]>();
  for (const item of items) {
    const elapsed = startOfToday - new Date(item.updatedAt).getTime();
    const key = elapsed < day ? "Today" : elapsed < day * 2 ? "Yesterday" : elapsed < day * 7 ? "Previous 7 days" : "Earlier";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

export function HistorySidebar({ conversations, activeId, open, onClose, onNewChat, onSelect, onClear, clearingAvailable }: Props) {
  return <>
    <button className={open ? "drawer-scrim is-visible" : "drawer-scrim"} onClick={onClose} aria-label="Close conversation history" tabIndex={open ? 0 : -1} />
    <aside className={open ? "sidebar is-open" : "sidebar"} aria-label="Minimi workspace">
      <div className="sidebar-brand">
        <a href="/" className="brand-lockup" aria-label="Minimi home"><span className="brand-mark"><Icon name="spark" size={18} /></span><span className="brand-word">minimi</span></a>
        <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close history"><Icon name="close" /></button>
      </div>
      <button className="new-chat-button" onClick={onNewChat}><Icon name="plus" size={17} /><span>New conversation</span><kbd>⌘ K</kbd></button>
      <div className="history-title-row"><span>YOUR LIBRARY</span><span className="history-count">{conversations.length}</span></div>
      <nav className="history-list" aria-label="Saved conversations">
        {groupConversations(conversations).map(([label, entries]) => <section className="history-group" key={label}>
          <h2>{label}</h2>
          {entries.map((item) => <button key={item.id} className={item.id === activeId ? "history-item is-active" : "history-item"} onClick={() => onSelect(item.id)} title={item.title} aria-current={item.id === activeId ? "page" : undefined}>
            <span className="history-item-icon"><Icon name="clock" size={15} /></span><span className="history-item-title">{item.title || "Untitled conversation"}</span>
          </button>)}
        </section>)}
        {!conversations.length && <div className="history-empty"><span className="empty-icon"><Icon name="book" size={19} /></span><p>Your research threads will live here.</p></div>}
      </nav>
      <div className="sidebar-footer">
        <div className="privacy-card"><span className="privacy-icon"><Icon name="lock" size={16} /></span><span><strong>Private by default</strong><small>Saved only on this device</small></span></div>
        <button className="clear-history-button" onClick={onClear} disabled={!clearingAvailable}><Icon name="trash" size={15} /> Clear all history</button>
        <div className="sidebar-version"><span className="status-indicator" /> Local workspace</div>
      </div>
    </aside>
  </>;
}

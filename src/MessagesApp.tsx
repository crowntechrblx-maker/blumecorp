import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";

interface UserResult {
  username: string;
  avatarUrl: string | null;
  lastSeen?: number;
}

interface Message {
  id: string;
  from: string;
  text: string;
  createdAt: number;
  isMine: boolean;
  canDelete: boolean;
}

export function MessagesApp({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
  isAdmin?: boolean;
  adminMode?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [active, setActive] = useState<UserResult | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const term = search.trim();
    const handle = setTimeout(() => {
      fetch(`/api/users?search=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then(setResults)
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [search]);

  function loadMessages(withUsername: string) {
    fetch(`/api/messages?with=${encodeURIComponent(withUsername)}`)
      .then((r) => r.json())
      .then(setMessages)
      .catch(() => setError("Couldn't load messages."));
  }

  function openConversation(user: UserResult) {
    setActive(user);
    setError(null);
    loadMessages(user.username);
  }

  useEffect(() => {
    if (!active) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadMessages(active.username), 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function handleDeleteMessage(id: string) {
    try {
      await fetch(`/api/messages?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setError("Couldn't delete message.");
    }
  }

  async function handleSend() {
    if (!active || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: active.username, text: draft.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDraft("");
      loadMessages(active.username);
    } catch (err) {
      setError((err as Error).message || "Couldn't send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app-content messages">
      <div className="messages-header">
        <Avatar url={avatarUrl} size={22} />
        <strong>{username}</strong>
      </div>

      <div className="messages-body">
        <div className="messages-sidebar">
          <input
            className="messages-search"
            placeholder="Filter by username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="messages-results">
            {results.length === 0 && (
              <p className="messages-empty-hint">
                {search.trim()
                  ? "No matching users."
                  : "No one has signed in during the past 7 days."}
              </p>
            )}
            {results.map((u) => (
              <button
                key={u.username}
                className={`message-item ${active?.username === u.username ? "active" : ""}`}
                onClick={() => openConversation(u)}
              >
                <Avatar url={u.avatarUrl} size={28} />
                <div>
                  <strong>{u.username}</strong>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="message-thread-panel">
          {!active && <p className="messages-empty-hint">Select someone to start chatting.</p>}
          {active && (
            <>
              <div className="message-thread">
                {messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.isMine ? "outgoing" : "incoming"}`}>
                    <span className="bubble-text">{m.text}</span>
                    {m.isMine && (
                      <span className="bubble-tick" title="Delivered">
                        ✓✓
                      </span>
                    )}
                    {m.canDelete && (
                      <button
                        className="bubble-delete"
                        onClick={() => handleDeleteMessage(m.id)}
                        title={m.isMine ? "Delete message" : "Admin delete"}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="messages-empty-hint">No messages yet — say hi to {active.username}.</p>
                )}
              </div>
              <div className="message-compose">
                <input
                  placeholder={`Message ${active.username}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !sending) handleSend();
                  }}
                />
                <button className="cta" disabled={sending || !draft.trim()} onClick={handleSend}>
                  Send
                </button>
              </div>
              {error && <p className="upload-error">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

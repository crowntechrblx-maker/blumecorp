import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { useFadingError } from "./useFadingError";

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
}

export function MessagesApp({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
  isAdmin?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [active, setActive] = useState<UserResult | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const { error, fading, setError } = useFadingError();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rosterPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  function loadRoster(term: string) {
    fetch(`/api/users?search=${encodeURIComponent(term)}`)
      .then((r) => r.json())
      .then(setResults)
      .catch(() => setResults([]));
  }

  function loadUnreadCounts() {
    fetch(`/api/messages?unread=1`)
      .then((r) => r.json())
      .then((counts: Record<string, number>) => setUnreadCounts(counts))
      .catch(() => {});
  }

  useEffect(() => {
    const term = search.trim();
    const handle = setTimeout(() => loadRoster(term), 200);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    // Keeps the sidebar ordering fresh (whoever last messaged you jumps to
    // the top) even while you aren't actively watching a conversation.
    loadUnreadCounts();
    rosterPollRef.current = setInterval(() => {
      loadRoster(search.trim());
      loadUnreadCounts();
    }, 5000);
    return () => {
      if (rosterPollRef.current) clearInterval(rosterPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // The GET above marks that person's messages as read on the backend —
    // clear the badge immediately rather than waiting for the next poll.
    setUnreadCounts((prev) => {
      const next = { ...prev };
      delete next[user.username.toLowerCase()];
      return next;
    });
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

  // Always land on the newest message instead of leaving the scroll
  // position wherever it happened to be — no one wants to scroll for it.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, active]);

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
      loadRoster(search.trim());
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
            {results.map((u) => {
              const unread = unreadCounts[u.username.toLowerCase()] || 0;
              return (
                <button
                  key={u.username}
                  className={`message-item ${active?.username === u.username ? "active" : ""}`}
                  onClick={() => openConversation(u)}
                >
                  <Avatar url={u.avatarUrl} size={28} />
                  <div>
                    <strong>{u.username}</strong>
                  </div>
                  {unread > 0 && (
                    <span className="message-unread-badge">{unread > 99 ? "99+" : unread}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="message-thread-panel">
          {!active && <p className="messages-empty-hint">Select someone to start chatting.</p>}
          {active && (
            <>
              <div className="message-thread" ref={threadRef}>
                {messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.isMine ? "outgoing" : "incoming"}`}>
                    <span className="bubble-text">{m.text}</span>
                    {m.isMine && (
                      <span className="bubble-tick" title="Delivered">
                        ✓
                      </span>
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
              {error && <p className={`upload-error${fading ? " fading-out" : ""}`}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

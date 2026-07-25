import { useEffect, useState } from "react";
import { TweetEmbed } from "./TweetEmbed";

interface RoyalTweet {
  id: string;
  url: string;
  addedByUsername: string;
  createdAt: number;
}

export function RoyalFamilyApp() {
  const [tweets, setTweets] = useState<RoyalTweet[]>([]);
  const [canAdd, setCanAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/royal-tweets");
      const data = await res.json();
      setTweets(data.tweets || []);
      setCanAdd(!!data.canAdd);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!newUrl.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/royal-tweets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setNewUrl("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-content royal">
      <h2>The Royal Family</h2>
      <div className="royal-grid">
        {["The King", "The Queen", "The Prince of Wales", "The Princess of Wales"].map((n) => (
          <div className="royal-card" key={n}>
            <div className="royal-avatar">👤</div>
            <span>{n}</span>
          </div>
        ))}
      </div>

      {canAdd && (
        <div className="section royal-add-section">
          <h3>Add a post</h3>
          <div className="royal-add-form">
            <input
              placeholder="https://x.com/psroyalfamily/status/..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <button className="cta" disabled={!newUrl.trim() || submitting} onClick={handleAdd}>
              {submitting ? "Adding..." : "Add post"}
            </button>
          </div>
          {error && <p className="royal-add-error">{error}</p>}
        </div>
      )}

      <div className="section">
        <h3>Posts</h3>
        {loading ? (
          <p className="royal-loading">Loading...</p>
        ) : tweets.length === 0 ? (
          <p className="royal-empty">No posts have been added yet.</p>
        ) : (
          <div className="royal-tweet-list">
            {tweets.map((t) => (
              <div className="royal-tweet-item" key={t.id}>
                <TweetEmbed url={t.url} />
                <p className="royal-tweet-meta">Added by {t.addedByUsername}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

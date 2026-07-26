import { useEffect, useState } from "react";
import { TweetEmbed } from "./TweetEmbed";

interface RoyalTweet {
  id: string;
  url: string;
  addedByUsername: string;
  createdAt: number;
}

interface RoyalProfile {
  title: string;
  handle: string;
  bio: string;
}

const ROYAL_PROFILES: RoyalProfile[] = [
  {
    title: "The King",
    handle: "EdwardMountbatten",
    bio: "His Majesty is the reigning monarch, having ascended the throne on 23rd June 2025. Alongside his official and ceremonial duties, The King has helped establish more than 20 charities over 40 years, supporting causes across the environment, rural communities, the arts, healthcare and education, and remains a focal point for national unity and continuity.",
  },
  {
    title: "The Queen",
    handle: "CarolineMountbatten",
    bio: "Her Majesty became Queen Consort after marrying The King on 31st August 2025, supporting him in his duties while undertaking her own public engagements. Her charity work spans health, literacy, survivor support, women's empowerment, animal welfare, dance and the arts, and she is widely seen as a symbol of duty, unity and voluntary service.",
  },
  {
    title: "The Prince of Wales",
    handle: "ArthurMountbatten",
    bio: "The Prince of Wales is heir to the throne and undertakes charitable, public and official duties in support of The King, in the UK and overseas. He regularly takes part in major Royal occasions, including State Visits, Trooping the Colour and the Order of the Garter at Windsor.",
  },
  {
    title: "The Princess Royal",
    handle: "BellaMountbatten",
    bio: "The Princess Royal supports The King through wide-ranging charitable work, public duties and official engagements at home and abroad, serving as Patron or President to numerous organisations and regularly representing the Royal Family at major national and international occasions.",
  },
  {
    title: "The Duke of Cambridge",
    handle: "PhilipMountbatten",
    bio: "The Duke of Cambridge supports The King through charitable initiatives and official engagements across the UK and overseas, serving as Patron or President to organisations focused on community, wellbeing and service, and regularly undertakes key Royal and ceremonial duties.",
  },
  {
    title: "The Duke of Westminster",
    handle: "HarryMountbatten",
    bio: "The Duke of Westminster supports The King as Head of State, representing him at events and visits in the UK and abroad, receiving Heads of State and government officials, and attending state and ceremonial occasions, with a strong economic and business focus.",
  },
];

export function RoyalFamilyApp() {
  const [tweets, setTweets] = useState<RoyalTweet[]>([]);
  const [canAdd, setCanAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/royal-tweets?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="app-content royal">
      <div className="royal-profiles-section">
        <h2>The Royal Family</h2>
        <div className="royal-profiles">
          {ROYAL_PROFILES.map((p) => (
            <div className="royal-profile-card" key={p.handle}>
              <div className="royal-profile-header">
                <div className="royal-avatar">👤</div>
                <div>
                  <h3 className="royal-profile-title">{p.title}</h3>
                  <span className="royal-profile-handle">@{p.handle}</span>
                </div>
              </div>
              <p className="royal-profile-bio">{p.bio}</p>
            </div>
          ))}
        </div>
      </div>

      <hr className="royal-divider" />

      {canAdd && (
        <div className="section royal-add-section">
          <h3>Add a post</h3>
          <div className="royal-add-form">
            <input
              placeholder="https://x.com/psroyalfamily/status/..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <button
              className="royal-add-btn"
              aria-label="Add post"
              title="Add post"
              disabled={!newUrl.trim() || submitting}
              onClick={handleAdd}
            >
              {submitting ? "…" : "+"}
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
                <div className="royal-tweet-footer">
                  <p className="royal-tweet-meta">Added by {t.addedByUsername}</p>
                  {canAdd && (
                    <button
                      className="royal-tweet-delete"
                      disabled={deletingId === t.id}
                      onClick={() => handleDelete(t.id)}
                    >
                      {deletingId === t.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

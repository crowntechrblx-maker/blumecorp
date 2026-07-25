import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { FileButton } from "./FileButton";
import { useFadingError } from "./useFadingError";

interface Post {
  id: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  text: string;
  imageUrl: string | null;
  createdAt: number;
  isMine: boolean;
  canDelete: boolean;
}

function timeAgo(ts: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function InstagramApp({
  username,
}: {
  username: string;
  isAdmin?: boolean;
  adminMode?: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const { error, fading, setError } = useFadingError();
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  function loadPosts() {
    fetch("/api/posts")
      .then((r) => r.json())
      .then(setPosts)
      .catch(() => setError("Couldn't load posts."));
  }

  useEffect(() => {
    loadPosts();
  }, []);

  const filteredPosts = search.trim()
    ? posts.filter((p) => p.authorUsername.toLowerCase().includes(search.trim().toLowerCase()))
    : posts;

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmitPost() {
    if (!text.trim() && !imageFile) {
      setError("Add some text or an image first.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const imageDataUrl = imageFile ? await fileToDataUrl(imageFile) : undefined;
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), imageDataUrl }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setText("");
      setImageFile(null);
      setComposing(false);
      loadPosts();
    } catch (err) {
      setError((err as Error).message || "Couldn't create post.");
    } finally {
      setPosting(false);
    }
  }

  async function handleDeletePost(id: string) {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/posts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError((err as Error).message || "Couldn't delete post.");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="app-content instagram">
      <div className="ig-topbar">
        <input
          className="ig-search"
          placeholder="Search by username"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="ig-plus" onClick={() => setComposing((v) => !v)} title="New post">
          +
        </button>
      </div>

      {composing && (
        <div className="ig-compose">
          <textarea
            placeholder={`What's on your mind, ${username}?`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <div className="ig-compose-row">
            <FileButton
              file={imageFile}
              onChange={setImageFile}
              accept="image/png,image/jpeg,image/webp,image/gif"
              label="Add image"
              disabled={posting}
            />
            <button className="cta" disabled={posting} onClick={handleSubmitPost}>
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
          {error && <p className={`upload-error${fading ? " fading-out" : ""}`}>{error}</p>}
        </div>
      )}

      <div className="ig-feed">
        {filteredPosts.length === 0 && (
          <p className="ig-empty">
            {search.trim() ? `No posts from "${search.trim()}" yet.` : "No posts yet — be the first."}
          </p>
        )}
        {filteredPosts.map((post) => (
          <div className="ig-post-card" key={post.id}>
            <div className="ig-post-header">
              <Avatar url={post.authorAvatarUrl} size={30} />
              <strong>{post.authorUsername}</strong>
              <span className="ig-post-time">{timeAgo(post.createdAt)}</span>
              {post.canDelete && (
                <button
                  className="ig-post-delete"
                  onClick={() => handleDeletePost(post.id)}
                  disabled={deletingIds.has(post.id)}
                  title={post.isMine ? "Delete post" : "Admin delete"}
                >
                  Delete
                </button>
              )}
            </div>
            {post.text && <p className="ig-post-text">{post.text}</p>}
            {post.imageUrl && <img className="ig-post-image" src={post.imageUrl} alt="" />}
          </div>
        ))}
      </div>
    </div>
  );
}

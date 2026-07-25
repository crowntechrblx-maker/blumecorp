import { useEffect, useState } from "react";
import { useWallpaper } from "./WallpaperContext";
import { FileButton } from "./FileButton";

interface WallpaperItem {
  id: string;
  url: string;
  visibility: "public" | "private";
  ownerUsername: string;
  isDefault: boolean;
  isMine?: boolean;
}

export function BackgroundsApp() {
  const { wallpaperUrl, setWallpaperUrl } = useWallpaper();
  const [items, setItems] = useState<WallpaperItem[]>([]);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadWallpapers() {
    fetch("/api/wallpapers")
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setError("Couldn't load backgrounds."));
  }

  useEffect(() => {
    loadWallpapers();
  }, []);

  function fileToDataUrl(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  async function handleUpload() {
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch("/api/wallpapers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, visibility }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFile(null);
      loadWallpapers();
    } catch (err) {
      setError((err as Error).message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="app-content backgrounds">
      <div className="backgrounds-upload">
        <h3>Upload a background</h3>
        <div className="backgrounds-upload-row">
          <FileButton
            file={file}
            onChange={setFile}
            accept="image/png,image/jpeg,image/webp,image/gif"
            label="Choose image"
            disabled={uploading}
          />
          <button
            type="button"
            className={`visibility-toggle-btn ${visibility}`}
            onClick={() => setVisibility((v) => (v === "public" ? "private" : "public"))}
            disabled={uploading}
            title="Click to switch between public and private"
          >
            {visibility === "public" ? "PUBLIC" : "PRIVATE"}
          </button>
          <button className="cta" disabled={uploading || !file} onClick={handleUpload}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {error && <p className="upload-error">{error}</p>}
      </div>

      <div className="backgrounds-body">
        <p className="backgrounds-hint">
          Pick a background below to set it as your desktop wallpaper. Uploads can be shared with
          everyone, or kept just for you.
        </p>

        <div className="backgrounds-grid">
          {items.map((item) => (
            <button
              key={item.id}
              className={`background-thumb ${item.url === wallpaperUrl ? "selected" : ""}`}
              onClick={() => setWallpaperUrl(item.url)}
              title={item.isDefault ? "Default" : `By ${item.ownerUsername}`}
            >
              <img className="background-thumb-img" src={item.url} alt="" />
              {item.visibility === "private" && <span className="private-badge">Only me</span>}
              <span className="owner-badge">{item.ownerUsername}</span>
              {item.url === wallpaperUrl && <span className="selected-badge">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

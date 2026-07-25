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
      <h2>Backgrounds</h2>
      <p className="backgrounds-hint">
        Pick a background below to set it as your desktop wallpaper. Uploads can be shared with
        everyone, or kept just for you.
      </p>

      <div className="backgrounds-grid">
        {items.map((item) => (
          <button
            key={item.id}
            className={`background-thumb ${item.url === wallpaperUrl ? "selected" : ""}`}
            style={{ backgroundImage: `url(${item.url})` }}
            onClick={() => setWallpaperUrl(item.url)}
            title={item.isDefault ? "Default" : `By ${item.ownerUsername}`}
          >
            {item.visibility === "private" && <span className="private-badge">Only me</span>}
            {item.url === wallpaperUrl && <span className="selected-badge">✓</span>}
          </button>
        ))}
      </div>

      <div className="section backgrounds-upload">
        <h3>Upload a background</h3>
        <div className="visibility-toggle">
          <label>
            <input
              type="radio"
              name="visibility"
              checked={visibility === "public"}
              onChange={() => setVisibility("public")}
            />
            Everyone can use it
          </label>
          <label>
            <input
              type="radio"
              name="visibility"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
            />
            Only me
          </label>
        </div>
        <div className="backgrounds-upload-row">
          <FileButton
            file={file}
            onChange={setFile}
            accept="image/png,image/jpeg,image/webp,image/gif"
            label="Choose image"
            disabled={uploading}
          />
          <button className="cta" disabled={uploading || !file} onClick={handleUpload}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {error && <p className="upload-error">{error}</p>}
      </div>
    </div>
  );
}

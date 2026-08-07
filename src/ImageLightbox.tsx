export function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}

export function ImageLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  return (
    <div className="image-lightbox-backdrop" onClick={onClose}>
      <img src={url} alt="" className="image-lightbox-image" onClick={(e) => e.stopPropagation()} />
      <button className="image-lightbox-close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

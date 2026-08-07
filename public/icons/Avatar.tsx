export function Avatar({ url, size = 32 }: { url?: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (url) {
    return <img className="avatar-img" style={style} src={url} alt="" />;
  }
  return <div className="avatar-img avatar-fallback" style={style} />;
}

import { useEffect, useState } from "react";

export function MenuBar({
  activeAppName,
  username,
}: {
  activeAppName: string;
  username: string;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="menubar">
      <div className="menubar-left">
        <img className="apple-logo" src="/logo.png" alt="Westbridge OS" />
        <span className="menubar-app-name">{activeAppName}</span>
        <span className="menubar-item">File</span>
        <span className="menubar-item">Edit</span>
        <span className="menubar-item">View</span>
        <span className="menubar-item">Window</span>
        <span className="menubar-item">Help</span>
      </div>
      <div className="menubar-right">
        <button
          className="menubar-user"
          onClick={() => {
            window.location.href = "/api/auth/logout";
          }}
          title="Log out"
        >
          {username}
        </button>
        <span className="menubar-item">{dateStr}</span>
        <span className="menubar-item">{timeStr}</span>
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    twttr?: {
      widgets: { load: (el?: HTMLElement) => void };
    };
  }
}

let widgetsScriptPromise: Promise<void> | null = null;

function loadTwitterWidgets(): Promise<void> {
  if (window.twttr) return Promise.resolve();
  if (widgetsScriptPromise) return widgetsScriptPromise;
  widgetsScriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.onload = () => resolve();
    document.body.appendChild(script);
  });
  return widgetsScriptPromise;
}

// Renders a tweet using X's official embed widget (widgets.js). This only
// works with a specific tweet URL you provide — X's public API for listing
// an account's latest tweets requires a paid developer plan, and scraping
// the site directly isn't something this app does.
export function TweetEmbed({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadTwitterWidgets().then(() => {
      if (cancelled || !containerRef.current) return;
      window.twttr?.widgets.load(containerRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    // X's widget picks a fixed pixel width based on the container's size
    // the moment it renders, and never revisits that — so resizing its
    // container afterwards leaves it either too narrow with a wall of
    // blank space next to it, or clipped. A plain window "resize" listener
    // isn't enough here: dragging a Westbridge OS window's corner resizes
    // this container without changing the actual browser viewport size, so
    // a ResizeObserver on the container itself is what actually catches it.
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let resizeTimer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (containerRef.current) window.twttr?.widgets.load(containerRef.current);
      }, 250);
    });
    observer.observe(el);
    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="tweet-embed" ref={containerRef}>
      <blockquote className="twitter-tweet" data-theme="light">
        <a href={url}>Loading post…</a>
      </blockquote>
    </div>
  );
}

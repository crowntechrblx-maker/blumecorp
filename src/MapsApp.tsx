import { useMemo, useRef, useState } from "react";
import { POIS, findRoute, routeDistanceMiles, ALL_NODES } from "./mapData";

const MAP_WIDTH = 1068;
const MAP_HEIGHT = 839;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3.5;

const nodeById = new Map(ALL_NODES.map((n) => [n.id, n]));

export function MapsApp() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const [search, setSearch] = useState("");
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<"from" | "to">("from");

  const path = useMemo(() => {
    if (!fromId || !toId || fromId === toId) return null;
    return findRoute(fromId, toId);
  }, [fromId, toId]);

  const distanceMiles = useMemo(() => (path ? routeDistanceMiles(path) : null), [path]);

  const filteredPois = search.trim()
    ? POIS.filter((p) => p.name!.toLowerCase().includes(search.trim().toLowerCase()))
    : POIS;

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.0016;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + z * delta)));
  }

  function handleMouseDown(e: React.MouseEvent) {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }

  function endDrag() {
    setDragging(false);
  }

  function pickPoi(id: string) {
    if (pendingSlot === "from") {
      setFromId(id);
      setPendingSlot("to");
    } else {
      setToId(id);
      setPendingSlot("from");
    }
  }

  function handleReset() {
    setFromId(null);
    setToId(null);
    setPendingSlot("from");
  }

  function zoomBy(factor: number) {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
  }

  const pathPoints = path
    ? path
        .map((id) => nodeById.get(id))
        .filter(Boolean)
        .map((n) => `${n!.x},${n!.y}`)
        .join(" ")
    : "";

  return (
    <div className="app-content maps-app">
      <div className="maps-toolbar">
        <input
          className="maps-search"
          placeholder="Search a location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="maps-zoom-controls">
          <button onClick={() => zoomBy(1 / 1.25)} title="Zoom out">
            −
          </button>
          <button onClick={() => zoomBy(1.25)} title="Zoom in">
            +
          </button>
        </div>
      </div>

      <div className="maps-directions">
        <div className="maps-directions-row">
          <label>From</label>
          <select
            value={fromId ?? ""}
            onChange={(e) => setFromId(e.target.value || null)}
          >
            <option value="">Select a location…</option>
            {POIS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="maps-directions-row">
          <label>To</label>
          <select value={toId ?? ""} onChange={(e) => setToId(e.target.value || null)}>
            <option value="">Select a location…</option>
            {POIS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="maps-directions-actions">
          <span className="maps-pick-hint">
            Or click two pins on the map — next click sets "{pendingSlot === "from" ? "From" : "To"}".
          </span>
          <button className="maps-reset-btn" onClick={handleReset}>
            Clear
          </button>
        </div>
        {fromId && toId && fromId === toId && (
          <p className="maps-route-info">Pick two different locations to get a route.</p>
        )}
        {distanceMiles !== null && (
          <p className="maps-route-info">
            Route found — approx. <strong>{distanceMiles.toFixed(1)} mi</strong>
          </p>
        )}
      </div>

      {search.trim() && (
        <div className="maps-search-results">
          {filteredPois.length === 0 && <p className="messages-empty-hint">No matches.</p>}
          {filteredPois.map((p) => (
            <button
              key={p.id}
              className="maps-search-result"
              onClick={() => {
                pickPoi(p.id);
                setSearch("");
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div
        className="maps-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <div
          className="maps-canvas-inner"
          style={{
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <img
            className="maps-image"
            src="/maps/westbridge-map.png"
            alt="Map of Westbridge"
            draggable={false}
          />
          <svg
            className="maps-overlay"
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
          >
            {path && (
              <polyline
                points={pathPoints}
                fill="none"
                stroke="#ff3b30"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="2 14"
                opacity={0.92}
              />
            )}
            {fromId && nodeById.get(fromId) && (
              <circle
                cx={nodeById.get(fromId)!.x}
                cy={nodeById.get(fromId)!.y}
                r={13}
                fill="none"
                stroke="#34c759"
                strokeWidth={4}
              />
            )}
            {toId && nodeById.get(toId) && (
              <circle
                cx={nodeById.get(toId)!.x}
                cy={nodeById.get(toId)!.y}
                r={13}
                fill="none"
                stroke="#ff3b30"
                strokeWidth={4}
              />
            )}
            {POIS.map((p) => (
              <circle
                key={p.id}
                cx={p.x}
                cy={p.y}
                r={12}
                fill="transparent"
                stroke="transparent"
                onClick={() => pickPoi(p.id)}
                style={{ cursor: "pointer" }}
              >
                <title>{p.name}</title>
              </circle>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

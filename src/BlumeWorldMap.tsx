import { useEffect, useMemo, useRef, useState } from "react";
import {
  LONDON_BOUNDARY,
  THAMES,
  THAMES_TRIBUTARIES,
  LONDON_ROADS,
  LANDMARKS,
  type LonLat,
} from "./blumeLondonMapData";

const WIDTH = 1000;
const HEIGHT = 960;
const LON_MIN = -0.6;
const LON_MAX = 0.3;
const LAT_MIN = 51.2;
const LAT_MAX = 51.74;
const MAP_COLOR = "#a0c7ed";

function project(lon: number, lat: number): [number, number] {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * WIDTH;
  const y = HEIGHT - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * HEIGHT;
  return [x, y];
}

// Builds a smooth Catmull-Rom spline through the anchor points (converted to
// cubic beziers) instead of connecting them with straight segments, so roads
// and the coastline read as real bending lines rather than a jagged zigzag.
function smoothPath(points: LonLat[], close: boolean): string {
  const pts = points.map(([lon, lat]) => project(lon, lat));
  const n = pts.length;
  if (n < 3) {
    let d = "";
    pts.forEach(([x, y], i) => {
      d += `${i === 0 ? "M" : " L"}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return close ? `${d} Z` : d;
  }
  const at = (i: number): [number, number] => {
    if (close) return pts[((i % n) + n) % n];
    return pts[Math.max(0, Math.min(n - 1, i))];
  };
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const segCount = close ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  if (close) d += " Z";
  return d;
}

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

const ROAD_STROKE: Record<string, number> = { motorway: 2.6, ring: 1.7, primary: 1, minor: 0.6 };
const ROAD_OPACITY: Record<string, number> = { motorway: 0.8, ring: 0.5, primary: 0.34, minor: 0.22 };

interface Ping {
  id: number;
  x: number;
  y: number;
}

interface Patrol {
  id: number;
  d: string;
  dur: number;
}

export function BlumeWorldMap() {
  const boundaryPath = useMemo(() => smoothPath(LONDON_BOUNDARY, true), []);
  const boundaryProjected = useMemo(
    () => LONDON_BOUNDARY.map(([lon, lat]) => project(lon, lat) as [number, number]),
    []
  );
  const thamesPath = useMemo(() => smoothPath(THAMES, false), []);
  const tributaryPaths = useMemo(() => THAMES_TRIBUTARIES.map((t) => smoothPath(t, false)), []);
  const roadPaths = useMemo(
    () => LONDON_ROADS.map((r) => ({ ...r, d: smoothPath(r.points, false) })),
    []
  );
  const landmarkPoints = useMemo(() => {
    const FONT_SIZE = 8.5;
    const CHAR_W = FONT_SIZE * 0.62;
    const LABEL_H = 10.5;
    const PAD = 1.5;
    type Box = { x0: number; x1: number; y0: number; y1: number };

    function intersects(a: Box, b: Box): boolean {
      return a.x0 - PAD < b.x1 && a.x1 + PAD > b.x0 && a.y0 - PAD < b.y1 && a.y1 + PAD > b.y0;
    }

    const projected = LANDMARKS.map((l) => ({ l, xy: project(l.lon, l.lat) }));
    // Every marker dot is itself an obstacle labels must dodge, not just
    // other labels, so a stacked label never lands on top of a neighbouring
    // landmark's marker. A label is never blocked by its own marker.
    const MARKER_R = 4;
    const markerBoxes: Box[] = projected.map(({ xy }) => ({
      x0: xy[0] - MARKER_R,
      x1: xy[0] + MARKER_R,
      y0: xy[1] - MARKER_R,
      y1: xy[1] + MARKER_R,
    }));
    const labelBoxes: Box[] = [];

    function overlapsAnything(box: Box, skipMarkerIndex: number): boolean {
      if (labelBoxes.some((p) => intersects(box, p))) return true;
      return markerBoxes.some((p, i) => i !== skipMarkerIndex && intersects(box, p));
    }

    return projected.map(({ l, xy }, idx) => {
      const [x, y] = xy;
      const leftHalf = x < WIDTH / 2;
      const anchor: "end" | "start" = leftHalf ? "end" : "start";
      const labelX = x + (leftHalf ? -6 : 6);
      const textWidth = l.name.length * CHAR_W;
      const x0 = anchor === "end" ? labelX - textWidth : labelX;
      const x1 = anchor === "end" ? labelX : labelX + textWidth;

      let labelY = y + 2.5;
      let box: Box = { x0, x1, y0: labelY - LABEL_H * 0.8, y1: labelY + LABEL_H * 0.3 };
      let step = 0;
      while (overlapsAnything(box, idx) && step < 80) {
        step++;
        const dir = step % 2 === 1 ? 1 : -1;
        const magnitude = Math.ceil(step / 2) * LABEL_H;
        labelY = y + 2.5 + dir * magnitude;
        box = { x0, x1, y0: labelY - LABEL_H * 0.8, y1: labelY + LABEL_H * 0.3 };
      }
      labelBoxes.push(box);
      return { ...l, x, y, anchor, labelX, labelY };
    });
  }, []);
  const gridLines = useMemo(() => {
    const verticals: number[] = [];
    const horizontals: number[] = [];
    for (let lon = Math.ceil(LON_MIN / 0.1) * 0.1; lon <= LON_MAX; lon += 0.1) {
      verticals.push(project(lon, LAT_MIN)[0]);
    }
    for (let lat = Math.ceil(LAT_MIN / 0.1) * 0.1; lat <= LAT_MAX; lat += 0.1) {
      horizontals.push(project(LON_MIN, lat)[1]);
    }
    return { verticals, horizontals };
  }, []);

  const [pings, setPings] = useState<Ping[]>([]);
  const nextPingId = useRef(0);

  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const nextPatrolId = useRef(0);

  useEffect(() => {
    function spawnPing() {
      const xs = boundaryProjected.map((p) => p[0]);
      const ys = boundaryProjected.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      let x = (minX + maxX) / 2;
      let y = (minY + maxY) / 2;
      for (let attempt = 0; attempt < 25; attempt++) {
        const tx = minX + Math.random() * (maxX - minX);
        const ty = minY + Math.random() * (maxY - minY);
        if (pointInPolygon(tx, ty, boundaryProjected)) {
          x = tx;
          y = ty;
          break;
        }
      }
      const id = nextPingId.current++;
      setPings((prev) => [...prev.slice(-9), { id, x, y }]);
      window.setTimeout(() => {
        setPings((prev) => prev.filter((p) => p.id !== id));
      }, 2000);
    }

    spawnPing();
    spawnPing();
    const interval = window.setInterval(spawnPing, 700);
    return () => window.clearInterval(interval);
  }, [boundaryProjected]);

  useEffect(() => {
    function spawnPatrol() {
      const road = roadPaths[Math.floor(Math.random() * roadPaths.length)];
      const dur = 4 + Math.random() * 3;
      const id = nextPatrolId.current++;
      setPatrols((prev) => [...prev.slice(-2), { id, d: road.d, dur }]);
      window.setTimeout(() => {
        setPatrols((prev) => prev.filter((p) => p.id !== id));
      }, dur * 1000 + 200);
    }

    const timeout = window.setTimeout(spawnPatrol, 900);
    const interval = window.setInterval(spawnPatrol, 3200);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [roadPaths]);

  return (
    <svg
      className="blume-worldmap-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <g opacity={0.14} stroke={MAP_COLOR} strokeWidth={0.5}>
        {gridLines.verticals.map((x, i) => (
          <line key={`v${i}`} x1={x} y1={0} x2={x} y2={HEIGHT} />
        ))}
        {gridLines.horizontals.map((y, i) => (
          <line key={`h${i}`} x1={0} y1={y} x2={WIDTH} y2={y} />
        ))}
      </g>
      <path d={boundaryPath} stroke={MAP_COLOR} strokeWidth={1} fill={MAP_COLOR} fillOpacity={0.045} />
      {roadPaths.map((r) => (
        <path
          key={r.name}
          d={r.d}
          stroke={MAP_COLOR}
          strokeWidth={ROAD_STROKE[r.cls]}
          opacity={ROAD_OPACITY[r.cls]}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {tributaryPaths.map((d, i) => (
        <path key={`trib${i}`} d={d} stroke={MAP_COLOR} strokeWidth={1.1} opacity={0.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <path d={thamesPath} stroke={MAP_COLOR} strokeWidth={2.8} opacity={0.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {patrols.map((p) => (
        <circle key={p.id} r={2.4} fill={MAP_COLOR}>
          <animateMotion dur={`${p.dur}s`} fill="freeze" path={p.d} />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.9;1" dur={`${p.dur}s`} fill="freeze" />
        </circle>
      ))}
      {landmarkPoints.map((l) => (
        <g key={l.name}>
          <rect x={l.x - 2} y={l.y - 2} width={4} height={4} fill={MAP_COLOR} opacity={0.9} transform={`rotate(45 ${l.x} ${l.y})`} />
          {Math.abs(l.labelY - l.y) > 6 && (
            <line x1={l.x} y1={l.y} x2={l.labelX} y2={l.labelY - 3} stroke={MAP_COLOR} strokeWidth={0.5} opacity={0.35} />
          )}
          <text
            x={l.labelX}
            y={l.labelY}
            textAnchor={l.anchor}
            fill={MAP_COLOR}
            opacity={0.72}
            fontSize={8.5}
            letterSpacing={0.3}
            style={{ textTransform: "uppercase", fontFamily: "inherit" }}
          >
            {l.name}
          </text>
        </g>
      ))}
      {pings.map((p) => (
        <g key={p.id}>
          <circle className="blume-worldmap-ping-ring" cx={p.x} cy={p.y} r={4} stroke={MAP_COLOR} />
          <circle className="blume-worldmap-ping-dot" cx={p.x} cy={p.y} r={2.5} fill={MAP_COLOR} />
        </g>
      ))}
    </svg>
  );
}

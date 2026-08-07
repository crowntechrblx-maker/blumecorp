import { useEffect, useMemo, useRef, useState } from "react";
import { LONDON_BOUNDARY, THAMES, LONDON_ROADS, LANDMARKS, type LonLat } from "./blumeLondonMapData";

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

function lineToPath(points: LonLat[], close: boolean): string {
  let d = "";
  points.forEach(([lon, lat], i) => {
    const [x, y] = project(lon, lat);
    d += `${i === 0 ? "M" : " L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return close ? `${d} Z` : d;
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

const ROAD_STROKE: Record<string, number> = { motorway: 2.6, ring: 1.7, primary: 1 };
const ROAD_OPACITY: Record<string, number> = { motorway: 0.8, ring: 0.5, primary: 0.32 };

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
  const boundaryPath = useMemo(() => lineToPath(LONDON_BOUNDARY, true), []);
  const boundaryProjected = useMemo(
    () => LONDON_BOUNDARY.map(([lon, lat]) => project(lon, lat) as [number, number]),
    []
  );
  const thamesPath = useMemo(() => lineToPath(THAMES, false), []);
  const roadPaths = useMemo(
    () => LONDON_ROADS.map((r) => ({ ...r, d: lineToPath(r.points, false) })),
    []
  );
  const landmarkPoints = useMemo(() => {
    const placedLabels: { x: number; y: number }[] = [];
    return LANDMARKS.map((l) => {
      const [x, y] = project(l.lon, l.lat);
      const leftHalf = x < WIDTH / 2;
      const anchor: "end" | "start" = leftHalf ? "end" : "start";
      let labelY = y + 2.5;
      let tries = 0;
      while (
        placedLabels.some((p) => Math.abs(p.x - x) < 150 && Math.abs(p.y - labelY) < 13) &&
        tries < 8
      ) {
        labelY += 13;
        tries++;
      }
      placedLabels.push({ x, y: labelY });
      return { ...l, x, y, anchor, labelX: x + (leftHalf ? -6 : 6), labelY };
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
            opacity={0.75}
            fontSize={9}
            letterSpacing={0.4}
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

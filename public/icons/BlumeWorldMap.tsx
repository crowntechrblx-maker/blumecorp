import { useEffect, useMemo, useRef, useState } from "react";
import { CONTINENTS } from "./blumeWorldMapData";

const WIDTH = 1000;
const HEIGHT = 560;
const LAT_LIMIT = 80;
const MAP_COLOR = "#a0c7ed";

function mercYNorm(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}
const MERC_Y_MAX = mercYNorm(LAT_LIMIT);

function project(lon: number, lat: number): [number, number] {
  const x = ((lon + 180) / 360) * WIDTH;
  const clamped = Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, lat));
  const y = HEIGHT / 2 - (mercYNorm(clamped) / MERC_Y_MAX) * (HEIGHT / 2);
  return [x, y];
}

type LonLat = [number, number];

const MERIDIANS = Array.from({ length: 13 }, (_, i) => -180 + i * 30);
const PARALLELS = [-80, -60, -40, -20, 0, 20, 40, 60, 80];

// Rings are ordered by landmass size; the largest are reliable/meaningful
// targets for random "on continent" ping placement.
const MAJOR_LANDMASSES = CONTINENTS.slice(0, 16);

const FLIGHT_ROUTES: [LonLat, LonLat][] = [
  [[-0.1, 51.5], [-74, 40.7]], // London - New York
  [[-118.2, 34], [139.7, 35.7]], // LA - Tokyo
  [[28, -26.2], [55.3, 25.2]], // Johannesburg - Dubai
  [[151.2, -33.9], [103.8, 1.35]], // Sydney - Singapore
  [[-46.6, -23.5], [-9.1, 38.7]], // Sao Paulo - Lisbon
  [[37.6, 55.75], [116.4, 39.9]], // Moscow - Beijing
  [[-87.6, 41.9], [2.3, 48.9]], // Chicago - Paris
];

// Splits the ring into subpaths wherever it crosses the antimeridian, so a
// landmass like Russia doesn't draw a stray line across the whole map.
function polygonToPath(points: LonLat[]): string {
  let d = "";
  let prevLon: number | null = null;
  let subpathOpen = false;
  points.forEach(([lon, lat]) => {
    const [x, y] = project(lon, lat);
    const wrapped = prevLon !== null && Math.abs(lon - prevLon) > 180;
    if (!subpathOpen || wrapped) {
      d += `${subpathOpen ? " Z " : ""}M${x.toFixed(1)},${y.toFixed(1)}`;
      subpathOpen = true;
    } else {
      d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    prevLon = lon;
  });
  return d + " Z";
}

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

interface Ping {
  id: number;
  x: number;
  y: number;
}

interface Flight {
  id: number;
  d: string;
  dur: number;
}

export function BlumeWorldMap() {
  const paths = useMemo(() => CONTINENTS.map(polygonToPath), []);
  const majorProjected = useMemo(
    () => MAJOR_LANDMASSES.map((poly) => poly.map(([lon, lat]) => project(lon, lat) as [number, number])),
    []
  );
  const meridianLines = useMemo(
    () => MERIDIANS.map((lon) => [project(lon, -LAT_LIMIT), project(lon, LAT_LIMIT)]),
    []
  );
  const parallelLines = useMemo(() => PARALLELS.map((lat) => project(0, lat)[1]), []);

  const [pings, setPings] = useState<Ping[]>([]);
  const nextPingId = useRef(0);

  const [flights, setFlights] = useState<Flight[]>([]);
  const nextFlightId = useRef(0);

  useEffect(() => {
    function spawnPing() {
      const poly = majorProjected[Math.floor(Math.random() * majorProjected.length)];
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      let x = (minX + maxX) / 2;
      let y = (minY + maxY) / 2;
      for (let attempt = 0; attempt < 25; attempt++) {
        const tx = minX + Math.random() * (maxX - minX);
        const ty = minY + Math.random() * (maxY - minY);
        if (pointInPolygon(tx, ty, poly)) {
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
  }, [majorProjected]);

  useEffect(() => {
    function spawnFlight() {
      const [a, b] = FLIGHT_ROUTES[Math.floor(Math.random() * FLIGHT_ROUTES.length)];
      const [x1, y1] = project(a[0], a[1]);
      const [x2, y2] = project(b[0], b[1]);
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2 - dist * 0.16;
      const d = `M${x1.toFixed(1)},${y1.toFixed(1)} Q${midX.toFixed(1)},${midY.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
      const dur = 5 + Math.random() * 2.5;
      const id = nextFlightId.current++;
      setFlights((prev) => [...prev.slice(-1), { id, d, dur }]);
      window.setTimeout(() => {
        setFlights((prev) => prev.filter((f) => f.id !== id));
      }, dur * 1000 + 200);
    }

    const timeout = window.setTimeout(spawnFlight, 1200);
    const interval = window.setInterval(spawnFlight, 6000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <svg
      className="blume-worldmap-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <g opacity={0.16} stroke={MAP_COLOR} strokeWidth={0.6}>
        {meridianLines.map(([a, b], i) => (
          <line key={`m${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
        ))}
        {parallelLines.map((y, i) => (
          <line key={`p${i}`} x1={0} y1={y} x2={WIDTH} y2={y} />
        ))}
      </g>
      <g stroke={MAP_COLOR} strokeWidth={0.85} fill={MAP_COLOR} fillOpacity={0.06} strokeLinejoin="round">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {flights.map((f) => (
        <g key={f.id}>
          <path d={f.d} stroke={MAP_COLOR} strokeWidth={0.5} strokeDasharray="2 3" fill="none" opacity={0.3} />
          <circle r={2.2} fill={MAP_COLOR}>
            <animateMotion dur={`${f.dur}s`} fill="freeze" path={f.d} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.9;1" dur={`${f.dur}s`} fill="freeze" />
          </circle>
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

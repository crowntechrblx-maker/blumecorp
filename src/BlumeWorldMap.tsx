import { useEffect, useMemo, useRef, useState } from "react";

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

const CONTINENTS: LonLat[][] = [
  // North America
  [
    [-168, 66], [-140, 70], [-95, 73], [-75, 63], [-60, 50], [-52, 47], [-64, 44],
    [-75, 35], [-81, 25], [-97, 18], [-90, 14], [-83, 9], [-79, 8], [-105, 20],
    [-115, 29], [-124, 40], [-124, 49], [-140, 60], [-168, 66],
  ],
  // Greenland
  [[-73, 83], [-20, 83], [-20, 76], [-45, 60], [-56, 60], [-73, 70], [-73, 83]],
  // South America
  [
    [-79, 9], [-77, 1], [-80, -5], [-81, -18], [-70, -30], [-71, -40], [-73, -53],
    [-68, -55], [-58, -52], [-53, -34], [-48, -25], [-35, -9], [-50, 3], [-60, 8],
    [-72, 11], [-79, 9],
  ],
  // Europe
  [
    [-9, 43], [-9, 53], [-5, 58], [5, 60], [10, 58], [18, 58], [24, 65], [30, 70],
    [40, 68], [60, 68], [60, 55], [48, 47], [38, 45], [27, 40], [19, 40], [12, 38],
    [3, 43], [-9, 43],
  ],
  // Africa
  [
    [-17, 21], [-17, 15], [-10, 6], [9, 4], [9, -2], [13, -6], [12, -18], [18, -34],
    [26, -34], [33, -25], [40, -15], [43, -2], [51, 12], [43, 12], [38, 15], [32, 22],
    [35, 31], [25, 32], [10, 37], [-6, 35], [-9, 29], [-17, 21],
  ],
  // Asia
  [
    [27, 70], [60, 70], [75, 73], [105, 73], [140, 73], [170, 66], [170, 55],
    [160, 50], [143, 43], [130, 35], [122, 25], [110, 18], [100, 6], [95, -8],
    [105, -9], [115, -8], [120, 15], [130, 30], [140, 40], [145, 45], [135, 53],
    [105, 54], [80, 50], [65, 55], [47, 42], [35, 40], [27, 50], [27, 70],
  ],
  // Australia
  [
    [113, -22], [122, -18], [130, -12], [142, -11], [148, -19], [153, -27],
    [150, -37], [140, -38], [131, -32], [115, -34], [113, -22],
  ],
];

const MERIDIANS = Array.from({ length: 13 }, (_, i) => -180 + i * 30);
const PARALLELS = [-80, -60, -40, -20, 0, 20, 40, 60, 80];

function polygonToPath(points: LonLat[]): string {
  return points
    .map(([lon, lat], i) => {
      const [x, y] = project(lon, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
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

export function BlumeWorldMap() {
  const projected = useMemo(
    () => CONTINENTS.map((poly) => poly.map(([lon, lat]) => project(lon, lat) as [number, number])),
    []
  );
  const paths = useMemo(() => CONTINENTS.map(polygonToPath), []);
  const meridianLines = useMemo(
    () => MERIDIANS.map((lon) => [project(lon, -LAT_LIMIT), project(lon, LAT_LIMIT)]),
    []
  );
  const parallelLines = useMemo(
    () => PARALLELS.map((lat) => project(0, lat)[1]),
    []
  );

  const [pings, setPings] = useState<Ping[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    function spawnPing() {
      const poly = projected[Math.floor(Math.random() * projected.length)];
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
      const id = nextId.current++;
      setPings((prev) => [...prev.slice(-5), { id, x, y }]);
      window.setTimeout(() => {
        setPings((prev) => prev.filter((p) => p.id !== id));
      }, 1900);
    }

    spawnPing();
    const interval = window.setInterval(spawnPing, 1500);
    return () => window.clearInterval(interval);
  }, [projected]);

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
      <g stroke={MAP_COLOR} strokeWidth={1.1} fill={MAP_COLOR} fillOpacity={0.05}>
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {pings.map((p) => (
        <g key={p.id}>
          <circle className="blume-worldmap-ping-ring" cx={p.x} cy={p.y} r={4} stroke={MAP_COLOR} />
          <circle className="blume-worldmap-ping-dot" cx={p.x} cy={p.y} r={2.5} fill={MAP_COLOR} />
        </g>
      ))}
    </svg>
  );
}

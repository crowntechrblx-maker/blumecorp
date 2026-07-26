// Westbridge road-network data, hand-traced against public/maps/westbridge-map.png
// (1068x839). Coordinates are in that image's native pixel space.
//
// - POIS are the named, searchable places (the pins already drawn on the map).
// - JUNCTIONS are unlabeled helper nodes marking road bends/intersections, so
//   routes follow something resembling the actual road layout instead of
//   cutting straight through buildings.
// - EDGES connects node ids into a single routable graph.

export interface MapNode {
  id: string;
  name?: string;
  x: number;
  y: number;
}

export const POIS: MapNode[] = [
  { id: "roundabout", name: "A29 Marsham Roundabout", x: 557, y: 35 },
  { id: "railxing", name: "Marsham Railroad Crossing", x: 563, y: 97 },
  { id: "raildepot", name: "Railway Depot", x: 675, y: 128 },
  { id: "j11", name: "A29 J11", x: 125, y: 165 },
  { id: "hospital", name: "St Matlocks Hospital", x: 347, y: 238 },
  { id: "mrpb", name: "MRPB", x: 560, y: 238 },
  { id: "wentworth", name: "Wentworth Automotive", x: 733, y: 268 },
  { id: "ambulance1", name: "Marsham Ambulance Stn", x: 466, y: 275 },
  { id: "tfl", name: "TFL", x: 573, y: 315 },
  { id: "shopetonPCC", name: "Shopeton Primary Care Centre", x: 784, y: 313 },
  { id: "raf", name: "RAF Shopeton", x: 989, y: 296 },
  { id: "ambulance2", name: "Matlock Ambulance Station", x: 330, y: 340 },
  { id: "policeBase", name: "Marsham Police Base", x: 511, y: 368 },
  { id: "garage", name: "Calvinos Garage", x: 584, y: 383 },
  { id: "reserve", name: "Reserve Centre", x: 716, y: 400 },
  { id: "shopetonNorth", name: "Shopeton North Train Station", x: 870, y: 377 },
  { id: "palace", name: "Palace", x: 330, y: 470 },
  { id: "expressDepot", name: "Mountbatten Express Depot", x: 456, y: 462 },
  { id: "highStreet", name: "High Street", x: 601, y: 440 },
  { id: "j12", name: "A29 J12", x: 40, y: 508 },
  { id: "busStation", name: "Bus Station", x: 521, y: 513 },
  { id: "kes", name: "KES", x: 663, y: 528 },
  { id: "claytonPark", name: "Clayton Park", x: 437, y: 555 },
  { id: "artivo", name: "Artivo Vehicle Hire", x: 611, y: 583 },
  { id: "strut", name: "Strut Used Cars", x: 716, y: 561 },
  { id: "powerStation", name: "Power Station", x: 181, y: 587 },
  { id: "farms", name: "Farms", x: 287, y: 573 },
  { id: "claytonRoad", name: "Clayton Road Train Stn", x: 416, y: 638 },
  { id: "hilcox", name: "Hilcox Tube Stn", x: 616, y: 655 },
  { id: "eastgate", name: "Eastgate Police Station", x: 709, y: 642 },
  { id: "oxbridge", name: "Oxbridge Police Station", x: 580, y: 727 },
];

const JUNCTIONS: MapNode[] = [
  { id: "jTopBend", x: 322, y: 68 },
  { id: "jLeftMid", x: 60, y: 340 },
  { id: "jB1057Mid", x: 200, y: 517 },
  { id: "jB1057Town", x: 330, y: 505 },
  { id: "jTownTop", x: 563, y: 175 },
  { id: "jHospitalLink", x: 400, y: 225 },
  { id: "jAmb2Link", x: 330, y: 300 },
  { id: "jEastUpper", x: 700, y: 220 },
  { id: "jShopetonRing", x: 850, y: 250 },
  { id: "jTownMid", x: 563, y: 320 },
  { id: "jReserveLink", x: 700, y: 355 },
  { id: "jTownLower1", x: 563, y: 400 },
  { id: "jTownLower2", x: 563, y: 470 },
  { id: "jKesLink", x: 650, y: 500 },
  { id: "jSouth1", x: 580, y: 600 },
  { id: "jSouth2", x: 580, y: 660 },
  { id: "jEastLower", x: 700, y: 600 },
  { id: "jClaytonLink", x: 420, y: 590 },
  { id: "jFarmsLink", x: 250, y: 560 },
  { id: "jPowerLink", x: 180, y: 560 },
];

export const ALL_NODES: MapNode[] = [...POIS, ...JUNCTIONS];

const EDGE_PAIRS: [string, string][] = [
  // A29 ring road
  ["roundabout", "jTopBend"],
  ["jTopBend", "j11"],
  ["j11", "jLeftMid"],
  ["jLeftMid", "j12"],

  // Roundabout down into the rail area
  ["roundabout", "railxing"],
  ["railxing", "raildepot"],
  ["railxing", "jTownTop"],

  // Town-centre north
  ["jTownTop", "mrpb"],
  ["mrpb", "jHospitalLink"],
  ["jHospitalLink", "hospital"],
  ["jHospitalLink", "ambulance1"],
  ["ambulance1", "jTownTop"],
  ["jHospitalLink", "jAmb2Link"],
  ["jAmb2Link", "ambulance2"],

  // East side (Wentworth / Shopeton / RAF)
  ["mrpb", "jEastUpper"],
  ["jEastUpper", "wentworth"],
  ["jEastUpper", "shopetonPCC"],
  ["jEastUpper", "jShopetonRing"],
  ["jShopetonRing", "raf"],
  ["jShopetonRing", "shopetonNorth"],

  // Town-centre spine, north to south
  ["mrpb", "jTownMid"],
  ["jTownMid", "tfl"],
  ["tfl", "policeBase"],
  ["tfl", "jReserveLink"],
  ["jReserveLink", "reserve"],
  ["policeBase", "garage"],
  ["garage", "jTownLower1"],
  ["jTownLower1", "highStreet"],
  ["highStreet", "jTownLower2"],
  ["jTownLower2", "busStation"],
  ["jTownLower2", "jKesLink"],
  ["jKesLink", "kes"],
  ["kes", "strut"],
  ["reserve", "jEastLower"],
  ["jEastLower", "strut"],
  ["jEastLower", "eastgate"],
  ["jEastLower", "jSouth1"],

  // South of town centre
  ["busStation", "jSouth1"],
  ["jSouth1", "artivo"],
  ["artivo", "jSouth2"],
  ["jSouth2", "hilcox"],
  ["hilcox", "eastgate"],
  ["jSouth2", "oxbridge"],

  // West side / B1057
  ["j12", "jB1057Mid"],
  ["jB1057Mid", "jB1057Town"],
  ["jB1057Town", "palace"],
  ["jB1057Town", "expressDepot"],
  ["palace", "ambulance2"],
  ["expressDepot", "highStreet"],
  ["jB1057Mid", "jPowerLink"],
  ["jPowerLink", "powerStation"],
  ["jPowerLink", "jFarmsLink"],
  ["jFarmsLink", "farms"],
  ["farms", "claytonPark"],
  ["claytonPark", "jClaytonLink"],
  ["jClaytonLink", "claytonRoad"],
  ["jClaytonLink", "busStation"],
];

export interface Graph {
  [nodeId: string]: { to: string; dist: number }[];
}

function dist(a: MapNode, b: MapNode) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function buildGraph(): Graph {
  const byId = new Map(ALL_NODES.map((n) => [n.id, n]));
  const graph: Graph = {};
  for (const n of ALL_NODES) graph[n.id] = [];
  for (const [a, b] of EDGE_PAIRS) {
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) continue;
    const d = dist(na, nb);
    graph[a].push({ to: b, dist: d });
    graph[b].push({ to: a, dist: d });
  }
  return graph;
}

// Simple Dijkstra shortest path. Returns the ordered list of node ids from
// `startId` to `endId`, or null if there's no route (shouldn't happen — the
// graph above is fully connected).
export function findRoute(startId: string, endId: string): string[] | null {
  const graph = buildGraph();
  const dists = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  const queue = new Set<string>(Object.keys(graph));

  for (const id of queue) dists.set(id, Infinity);
  dists.set(startId, 0);

  while (queue.size > 0) {
    let current: string | null = null;
    let currentDist = Infinity;
    for (const id of queue) {
      const d = dists.get(id)!;
      if (d < currentDist) {
        currentDist = d;
        current = id;
      }
    }
    if (current === null) break;
    queue.delete(current);
    visited.add(current);
    if (current === endId) break;

    for (const edge of graph[current] || []) {
      if (visited.has(edge.to)) continue;
      const candidate = currentDist + edge.dist;
      if (candidate < (dists.get(edge.to) ?? Infinity)) {
        dists.set(edge.to, candidate);
        prev.set(edge.to, current);
      }
    }
  }

  if (!prev.has(endId) && startId !== endId) return null;

  const path: string[] = [endId];
  let cur = endId;
  while (cur !== startId) {
    const p = prev.get(cur);
    if (!p) return null;
    path.unshift(p);
    cur = p;
  }
  return path;
}

// Purely cosmetic conversion so distances read like a real place — the map
// has no real-world scale, so this is a fixed, made-up ratio.
const PIXELS_PER_MILE = 480;

export function routeDistanceMiles(path: string[]): number {
  const byId = new Map(ALL_NODES.map((n) => [n.id, n]));
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = byId.get(path[i]);
    const b = byId.get(path[i + 1]);
    if (!a || !b) continue;
    total += dist(a, b);
  }
  return total / PIXELS_PER_MILE;
}

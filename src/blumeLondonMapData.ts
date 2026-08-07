// Simplified, stylized coordinates (lon, lat) for a wireframe map of Greater
// London: the outer boundary, the Thames, the major road network, and a
// handful of landmark points. Not survey-accurate — proportioned closely
// enough to real geography to be recognizable at wireframe scale.

export type LonLat = [number, number];

export const LONDON_BOUNDARY: LonLat[] = [
  [-0.49, 51.61],
  [-0.48, 51.55],
  [-0.45, 51.47],
  [-0.51, 51.43],
  [-0.46, 51.38],
  [-0.3, 51.39],
  [-0.19, 51.33],
  [-0.15, 51.31],
  [-0.09, 51.32],
  [0.03, 51.31],
  [0.09, 51.37],
  [0.15, 51.44],
  [0.18, 51.48],
  [0.19, 51.52],
  [0.18, 51.58],
  [0.07, 51.63],
  [-0.08, 51.67],
  [-0.17, 51.68],
  [-0.28, 51.65],
  [-0.45, 51.63],
  [-0.49, 51.61],
];

export const THAMES: LonLat[] = [
  [-0.34, 51.4],
  [-0.3, 51.41],
  [-0.3, 51.46],
  [-0.29, 51.48],
  [-0.24, 51.49],
  [-0.22, 51.46],
  [-0.19, 51.46],
  [-0.15, 51.48],
  [-0.12, 51.49],
  [-0.12, 51.5],
  [-0.11, 51.505],
  [-0.1, 51.51],
  [-0.075, 51.505],
  [-0.05, 51.502],
  [-0.02, 51.51],
  [-0.005, 51.505],
  [-0.015, 51.492],
  [0.0, 51.483],
  [0.06, 51.495],
  [0.1, 51.5],
  [0.18, 51.48],
  [0.24, 51.47],
];

export interface LondonRoad {
  name: string;
  cls: "motorway" | "ring" | "primary";
  points: LonLat[];
}

export const LONDON_ROADS: LondonRoad[] = [
  {
    name: "M25",
    cls: "motorway",
    points: [
      [0.21, 51.47],
      [0.14, 51.36],
      [-0.02, 51.29],
      [-0.2, 51.24],
      [-0.36, 51.28],
      [-0.51, 51.36],
      [-0.55, 51.47],
      [-0.51, 51.57],
      [-0.44, 51.65],
      [-0.3, 51.7],
      [-0.13, 51.71],
      [0.02, 51.68],
      [0.15, 51.63],
      [0.23, 51.55],
      [0.21, 51.47],
    ],
  },
  {
    name: "North Circular",
    cls: "ring",
    points: [
      [-0.27, 51.49],
      [-0.29, 51.53],
      [-0.25, 51.57],
      [-0.15, 51.6],
      [-0.05, 51.59],
      [0.02, 51.56],
      [0.03, 51.52],
      [-0.02, 51.49],
    ],
  },
  {
    name: "South Circular",
    cls: "ring",
    points: [
      [-0.27, 51.49],
      [-0.25, 51.45],
      [-0.19, 51.42],
      [-0.1, 51.41],
      [0.0, 51.44],
      [0.05, 51.47],
      [0.02, 51.49],
    ],
  },
  { name: "A1", cls: "primary", points: [[-0.135, 51.565], [-0.17, 51.61], [-0.2, 51.65], [-0.21, 51.7]] },
  { name: "A2", cls: "primary", points: [[-0.09, 51.49], [0.02, 51.465], [0.1, 51.455], [0.2, 51.445]] },
  { name: "A3", cls: "primary", points: [[-0.12, 51.485], [-0.19, 51.45], [-0.28, 51.42], [-0.35, 51.35]] },
  {
    name: "A4",
    cls: "primary",
    points: [[-0.152, 51.503], [-0.224, 51.492], [-0.27, 51.49], [-0.35, 51.48], [-0.45, 51.47]],
  },
  { name: "A10", cls: "primary", points: [[-0.08, 51.527], [-0.07, 51.59], [-0.06, 51.61], [-0.05, 51.68]] },
  { name: "A11", cls: "primary", points: [[-0.075, 51.515], [-0.03, 51.535], [0.0, 51.542], [0.03, 51.55]] },
  { name: "A12", cls: "primary", points: [[-0.03, 51.53], [0.02, 51.56], [0.06, 51.58], [0.09, 51.6]] },
  {
    name: "A13",
    cls: "primary",
    points: [[-0.035, 51.51], [0.03, 51.52], [0.08, 51.535], [0.15, 51.545], [0.25, 51.52]],
  },
  { name: "A20", cls: "primary", points: [[-0.03, 51.475], [-0.015, 51.46], [0.03, 51.44], [0.1, 51.4]] },
  {
    name: "A23",
    cls: "primary",
    points: [[-0.1, 51.495], [-0.11, 51.462], [-0.13, 51.427], [-0.1, 51.375], [-0.1, 51.32]],
  },
  { name: "A24", cls: "primary", points: [[-0.14, 51.465], [-0.16, 51.427], [-0.19, 51.4], [-0.2, 51.34]] },
  { name: "A40", cls: "primary", points: [[-0.16, 51.513], [-0.27, 51.508], [-0.3, 51.513], [-0.45, 51.53]] },
  { name: "A41", cls: "primary", points: [[-0.16, 51.522], [-0.23, 51.583], [-0.35, 51.63]] },
];

export interface Landmark {
  name: string;
  lon: number;
  lat: number;
}

export const LANDMARKS: Landmark[] = [
  { name: "Houses of Parliament", lon: -0.1246, lat: 51.4995 },
  { name: "Buckingham Palace", lon: -0.1419, lat: 51.5014 },
  { name: "Tower Bridge", lon: -0.0754, lat: 51.5055 },
  { name: "St Paul's Cathedral", lon: -0.0984, lat: 51.5138 },
  { name: "The Shard", lon: -0.0865, lat: 51.5045 },
  { name: "Canary Wharf", lon: -0.0235, lat: 51.5054 },
  { name: "O2 Arena", lon: 0.0032, lat: 51.503 },
  { name: "Greenwich Observatory", lon: -0.0005, lat: 51.4769 },
  { name: "Wembley Stadium", lon: -0.2795, lat: 51.556 },
  { name: "Kew Gardens", lon: -0.2956, lat: 51.4787 },
  { name: "Hyde Park", lon: -0.1657, lat: 51.5073 },
  { name: "King's Cross", lon: -0.1238, lat: 51.5308 },
  { name: "Heathrow Airport", lon: -0.4543, lat: 51.47 },
  { name: "Wimbledon", lon: -0.2148, lat: 51.434 },
];

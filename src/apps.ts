export type AppId =
  | "tfl"
  | "uber"
  | "swiftCorporate"
  | "maps"
  | "psRolls"
  | "royalFamily"
  | "blume"
  | "instagram"
  | "messages"
  | "backgrounds";

export interface AppDef {
  id: AppId;
  name: string;
  icon: string;
  color: string;
  defaultSize: { width: number; height: number };
}

export const APPS: AppDef[] = [
  {
    id: "tfl",
    name: "Transport for London",
    icon: "🚇",
    color: "#0019a8",
    defaultSize: { width: 480, height: 560 },
  },
  {
    id: "uber",
    name: "Uber",
    icon: "🚗",
    color: "#000000",
    defaultSize: { width: 420, height: 620 },
  },
  {
    id: "swiftCorporate",
    name: "Swift Corporate",
    icon: "💼",
    color: "#1f2937",
    defaultSize: { width: 560, height: 520 },
  },
  {
    id: "maps",
    name: "Maps",
    icon: "🗺️",
    color: "#2e8b57",
    defaultSize: { width: 640, height: 520 },
  },
  {
    id: "psRolls",
    name: "PS C&M Rolls",
    icon: "📋",
    color: "#7c3aed",
    defaultSize: { width: 560, height: 480 },
  },
  {
    id: "royalFamily",
    name: "Royal Family",
    icon: "👑",
    color: "#9c1c2e",
    defaultSize: { width: 560, height: 560 },
  },
  {
    id: "blume",
    name: "Blume",
    icon: "🌸",
    color: "#e0779c",
    defaultSize: { width: 480, height: 560 },
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: "📷",
    color: "#d6249f",
    defaultSize: { width: 560, height: 640 },
  },
  {
    id: "messages",
    name: "Messages",
    icon: "💬",
    color: "#2ecc71",
    defaultSize: { width: 520, height: 560 },
  },
  {
    id: "backgrounds",
    name: "Backgrounds",
    icon: "🖼️",
    color: "#334155",
    defaultSize: { width: 600, height: 560 },
  },
];

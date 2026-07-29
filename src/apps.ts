export type AppId =
  | "tfl"
  | "uber"
  | "swiftCorporate"
  | "psRolls"
  | "royalFamily"
  | "blume"
  | "instagram"
  | "messages"
  | "backgrounds"
  | "settings";

export interface AppDef {
  id: AppId;
  name: string;
  icon: string;
  // Optional image rendered on top of the coloured icon badge (instead of
  // the plain `icon` glyph text) — used for apps with a real brand logo,
  // e.g. Blume's desktop icon.
  iconImage?: string;
  // When set, iconImage fills the whole tile (rounded corners, no colour
  // badge behind it) instead of sitting as a small logo centred on `color`
  // — for icons that are a complete image in their own right (Instagram,
  // Messages, Settings, Backgrounds), as opposed to a wordmark/crest that
  // needs a background colour behind it (Uber, TFL, Royal, Blume).
  iconFull?: boolean;
  color: string;
  defaultSize: { width: number; height: number };
}

export const APPS: AppDef[] = [
  {
    id: "tfl",
    name: "Transport for London",
    icon: "",
    iconImage: "/icons/tfl-roundel.png",
    color: "#ffffff",
    defaultSize: { width: 480, height: 560 },
  },
  {
    id: "uber",
    name: "Uber",
    icon: "",
    iconImage: "/icons/uber-bit-white.png",
    color: "#000000",
    defaultSize: { width: 420, height: 620 },
  },
  {
    id: "swiftCorporate",
    name: "Swift Corporate",
    icon: "",
    iconImage: "/icons/swift-corporate-tile-v2.png",
    iconFull: true,
    color: "#f4f1ea",
    defaultSize: { width: 800, height: 600 },
  },
  {
    id: "psRolls",
    name: "PS C&M Rolls",
    icon: "",
    iconImage: "/icons/cm-rolls-tile.png",
    iconFull: true,
    color: "#ffffff",
    defaultSize: { width: 800, height: 600 },
  },
  {
    id: "royalFamily",
    name: "Royal Family",
    icon: "",
    iconImage: "/icons/royal-crest.svg",
    color: "#ffffff",
    defaultSize: { width: 560, height: 560 },
  },
  {
    id: "blume",
    name: "Blume",
    icon: "",
    iconImage: "/blume-logo.png",
    color: "#07203b",
    defaultSize: { width: 720, height: 560 },
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: "",
    iconImage: "/icons/instagram-icon.svg",
    iconFull: true,
    color: "#ffffff",
    defaultSize: { width: 560, height: 640 },
  },
  {
    id: "messages",
    name: "Messages",
    icon: "",
    iconImage: "/icons/messages-icon.svg",
    iconFull: true,
    color: "#1cb552",
    defaultSize: { width: 520, height: 560 },
  },
  {
    id: "backgrounds",
    name: "Backgrounds",
    icon: "",
    iconImage: "/icons/backgrounds-icon.svg",
    iconFull: true,
    color: "#1f7fe0",
    defaultSize: { width: 600, height: 560 },
  },
  {
    id: "settings",
    name: "Settings",
    icon: "",
    iconImage: "/icons/settings-icon.svg",
    iconFull: true,
    color: "#83868e",
    defaultSize: { width: 720, height: 600 },
  },
];

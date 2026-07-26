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
  color: string;
  defaultSize: { width: number; height: number };
}

export const APPS: AppDef[] = [
  {
    id: "tfl",
    name: "Transport for London",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 480, height: 560 },
  },
  {
    id: "uber",
    name: "Uber",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 420, height: 620 },
  },
  {
    id: "swiftCorporate",
    name: "Swift Corporate",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 800, height: 600 },
  },
  {
    id: "psRolls",
    name: "PS C&M Rolls",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 800, height: 600 },
  },
  {
    id: "royalFamily",
    name: "Royal Family",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 560, height: 560 },
  },
  {
    id: "blume",
    name: "Blume",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 720, height: 560 },
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 560, height: 640 },
  },
  {
    id: "messages",
    name: "Messages",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 520, height: 560 },
  },
  {
    id: "backgrounds",
    name: "Backgrounds",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 600, height: 560 },
  },
  {
    id: "settings",
    name: "Settings",
    icon: "",
    color: "#ff0000",
    defaultSize: { width: 720, height: 600 },
  },
];

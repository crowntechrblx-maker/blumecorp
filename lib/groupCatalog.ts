import { kv } from "./kv.js";

export type GroupCategory = "Emergency Services" | "Intelligence" | "IE" | "OCG" | "Other";
export const GROUP_CATEGORIES: GroupCategory[] = ["Emergency Services", "Intelligence", "IE", "OCG", "Other"];

export function tierForCategory(category: string): "red" | "white" {
  return category === "IE" || category === "OCG" ? "red" : "white";
}

export interface CustomGroup {
  id: number;
  name: string;
  category: GroupCategory;
}

export const GROUP_SEED: CustomGroup[] = [
  { id: 10742221, name: "G-Block", category: "OCG" },
  { id: 223035360, name: "Shadow District", category: "OCG" },
  { id: 679403020, name: "Harakat", category: "OCG" },
  { id: 16684944, name: "National Liberation Movement", category: "OCG" },
  { id: 34067916, name: "CHS", category: "OCG" },
  { id: 541807, name: "UK | United Kingdom", category: "OCG" },
  { id: 14641286, name: "TUI Airways | Roblox", category: "OCG" },
  { id: 696897291, name: "Motorway Roleplay", category: "OCG" },
  { id: 11939831, name: "Nottinghamshire, England", category: "OCG" },
  { id: 16339807, name: "Liber Studios", category: "OCG" },
  { id: 34544324, name: "UK | Sandford Studios", category: "OCG" },
  { id: 12982639, name: "NEMG | North East Medical Group", category: "OCG" },
  { id: 8103, name: "UK Explorium Studios", category: "OCG" },
  { id: 1176461, name: "Union Studios", category: "OCG" },
  { id: 2792847, name: "Crown Studios", category: "OCG" },
  { id: 1059884, name: "Imperium Studios", category: "OCG" },
  { id: 979414846, name: "[IP] Interactive Productions", category: "OCG" },
  { id: 32324698, name: "PHOENIX Studios Group", category: "OCG" },
  { id: 33392881, name: "Aris Production", category: "OCG" },
  { id: 34564109, name: "Liber Studios ND", category: "OCG" },
  { id: 35662128, name: "United Establishment", category: "OCG" },
  { id: 5081986, name: "Yaris United Kingdom", category: "OCG" },
  { id: 35273143, name: "Explorium Studios", category: "OCG" },

  { id: 32650605, name: "London Air Ambulance", category: "Emergency Services" },
  { id: 879056831, name: "London Ambulance Service", category: "Emergency Services" },
  { id: 493990898, name: "Metropolitan Police Service", category: "Emergency Services" },
  { id: 360230741, name: "London Fire Brigade", category: "Emergency Services" },
  { id: 820909258, name: "British Transport Police", category: "Emergency Services" },
  { id: 743983922, name: "Greater Manchester Police", category: "Emergency Services" },
  { id: 987422423, name: "Police Service of Northern Ireland", category: "Emergency Services" },
  { id: 278125181, name: "National Police Air Service", category: "Emergency Services" },
  { id: 740750486, name: "Kent Police", category: "Emergency Services" },

  { id: 931656944, name: "British Forces", category: "Intelligence" },
  { id: 567563234, name: "HM Revenue and Customs", category: "Intelligence" },
  { id: 154853936, name: "MI5", category: "Intelligence" },
  { id: 142915989, name: "National Crime Agency", category: "Intelligence" },
  { id: 685466511, name: "SIS (MI6)", category: "Intelligence" },
  { id: 34974741, name: "Immigration Enforcement", category: "Intelligence" },
  { id: 11086948, name: "Hatzola", category: "Intelligence" },
  { id: 35167585, name: "Royal Households", category: "Intelligence" },
  { id: 841518502, name: "Home Office", category: "Intelligence" },
  { id: 187507831, name: "Central Intelligence Agency", category: "Intelligence" },
  { id: 963189576, name: "JTF2", category: "Intelligence" },
  { id: 315987361, name: "Regional Organised Crime Unit", category: "Intelligence" },
  { id: 496716538, name: "U.S Marshals Service", category: "Intelligence" },
  { id: 841282433, name: "London Freemasons", category: "Intelligence" },
  { id: 1033941381, name: "Consulate of the People's Republic of China", category: "Intelligence" },
];

export async function getRawGroupCatalog(): Promise<CustomGroup[]> {
  let custom = await kv.get<CustomGroup[]>("blumeCustomGroups");
  if (custom === null || custom === undefined) {
    custom = GROUP_SEED;
    await kv.set("blumeCustomGroups", custom);
  }
  return custom;
}

export async function getGroupCatalog(): Promise<
  Record<number, { name: string; tier: "red" | "white"; category: GroupCategory }>
> {
  const custom = await getRawGroupCatalog();
  const merged: Record<number, { name: string; tier: "red" | "white"; category: GroupCategory }> = {};
  for (const c of custom) merged[c.id] = { name: c.name, tier: tierForCategory(c.category), category: c.category };
  return merged;
}

export async function getGroupIdsByCategory(category: GroupCategory): Promise<number[]> {
  const custom = await getRawGroupCatalog();
  return custom.filter((c) => c.category === category).map((c) => c.id);
}

export async function getGroupIdsExcludingCategories(excluded: GroupCategory[]): Promise<number[]> {
  const custom = await getRawGroupCatalog();
  return custom.filter((c) => !excluded.includes(c.category)).map((c) => c.id);
}

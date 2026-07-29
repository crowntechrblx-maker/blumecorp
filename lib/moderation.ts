const BLOCKED_TERMS = [
  "nigger",
  "nigga",
  "chink",
  "spic",
  "kike",
  "wetback",
  "gook",
  "coon",
  "beaner",
  "paki",
  "raghead",
  "towelhead",
  "tranny",
  "faggot",
  "fag",
  "dyke",
  "retard",
  "retarded",
  "cripple",
  "cunt",
  "whore",
  "slut",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "piss",
  "cock",
  "pussy",
  "twat",
  "wanker",
  "motherfucker",
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[^a-z]/g, "");
}

export function containsBlockedLanguage(text: string): boolean {
  if (!text) return false;
  const normalized = normalize(text);
  if (!normalized) return false;
  return BLOCKED_TERMS.some((term) => normalized.includes(term));
}

export const MODERATION_REJECTION_MESSAGE =
  "That contains language that isn't allowed here — please rephrase.";

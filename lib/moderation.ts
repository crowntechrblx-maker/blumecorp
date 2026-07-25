// Blocks profanity, slurs, and other derogatory language from any
// user-submitted free text (Instagram posts, messages, Blume reports and
// blog posts). This is a word-list match, not a slur "generator" — the list
// itself is never exposed to clients.
//
// Matching is deliberately loose (substring, with common leetspeak
// substitutions normalized first) so obvious evasions like "a$$hole" or
// "n1gger" are still caught, at the cost of occasionally over-blocking. That
// trade-off is intentional for a moderation filter.

const BLOCKED_TERMS = [
  // Slurs (racial, ethnic, homophobic, transphobic, ableist, misogynistic).
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
  // General profanity.
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

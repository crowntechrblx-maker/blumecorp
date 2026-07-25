// Kept in sync with lib/moderation.ts's MODERATION_REJECTION_MESSAGE.
// Only the rejection copy lives here on the client — never the blocked-word
// list itself, which stays server-side only.
export const MODERATION_REJECTION_MESSAGE =
  "That contains language that isn't allowed here — please rephrase.";

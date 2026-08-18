/**
 * Brand handles used for auto-approving creator posts.
 *
 * A scraped post is counted as sponsored work only when the caption contains a
 * real @mention of one of our accounts. Set these to Able's actual handles per
 * platform. Two things make this fiddly and both are handled below:
 *
 *  • the username can differ by platform (e.g. @able on one, @able.finance on
 *    another), so every valid handle goes in HANDLE_TOKENS;
 *  • TikTok often renders a mention as the DISPLAY NAME, so the caption text
 *    arrives as "@Able Finance" with a space rather than the username. That
 *    shape is matched by DISPLAY_MENTION.
 *
 * Everything is anchored on "@", so the brand name appearing as ordinary words
 * in a caption never auto-approves a post.
 */

/** Exact @handle tokens, lowercase, no leading "@". */
export const HANDLE_TOKENS = new Set<string>(["able", "ablefinance", "able.finance"]);

/** Display-name form of the mention, e.g. "@Able Finance". */
export const DISPLAY_MENTION = /@\s*able(\s+finance)?\b/i;

/** Handle shown in the UI, e.g. on the Our Posts page. */
export const PRIMARY_HANDLE = "@able";

export function captionMentionsBrand(caption: string | null | undefined): boolean {
  if (!caption) return false;
  const c = caption.toLowerCase();
  for (const m of c.matchAll(/@([a-z0-9_.]+)/g)) {
    if (HANDLE_TOKENS.has(m[1].replace(/\.+$/, ""))) return true;
  }
  return DISPLAY_MENTION.test(c);
}

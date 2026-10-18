/**
 * How a headline number is coloured.
 *
 * There used to be six or seven hues across the stat rows — purple downloads,
 * cyan MRR, amber conversion, emerald countries — assigned per card with no
 * rule behind them. Colour that doesn't mean anything is just noise, and it
 * made every row look like a chart legend.
 *
 * The rule now: colour marks MONEY DIRECTION and nothing else.
 *
 *   money in / positive  → green
 *   money out / negative → red
 *   everything else      → plain ink
 *
 * Counts, rates and ratios all use one colour: a pale tint of the accent,
 * not plain white. White is what unstyled text looks like; a tint belongs to
 * the palette while staying neutral enough that green and red still read as
 * meaning something.
 */

/** Counts, rates, ratios — anything that isn't money moving. */
export const STAT_NEUTRAL = "text-stat";

/** Money coming in, or a balance that's healthy. */
export const STAT_POSITIVE = "text-app-green";

/** Money going out, or a balance in the red. */
export const STAT_NEGATIVE = "text-app-red-text";

/** A balance that can go either way — the sign picks the colour. */
export const statBySign = (n: number): string => (n >= 0 ? STAT_POSITIVE : STAT_NEGATIVE);

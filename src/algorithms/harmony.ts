import type { DominantColor, HarmonyMatch, HarmonyType } from "./types";

/**
 * Decides whether a palette actually shows one of the classical color
 * harmonies. Pure and host-agnostic — it takes dominant colors and returns
 * either the harmony they form or nothing at all. The rules it implements are
 * fixed by ADR-008.
 *
 * A photograph either has a harmony or it does not, so the answer is that and
 * not a percentage: a number in the middle of the range reads as a weak match
 * when what it really means is no match.
 */

/**
 * A harmony as hue offsets from a base — the ones that are a *shape* on the
 * wheel, with the colors spread around it.
 *
 * `monochromatic` and `analogous` are absent because they are not shapes but
 * arcs: one hue with variations, and neighbouring hues. Fixing them as offsets
 * would mean picking a color count and a spacing, and a run of four hues 20
 * degrees apart is as analogous as three at thirty. They are decided from how
 * wide an arc the palette occupies instead.
 *
 * Ordering is by arm count, and the search reports the richest match — a square
 * contains two complementary pairs, and reporting the pair would be describing
 * a corner of what is there.
 */
const TEMPLATES: readonly (readonly [HarmonyType, number[]])[] = [
  ["square", [0, 90, 180, 270]],
  ["tetradic", [0, 60, 180, 240]],
  ["triadic", [0, 120, 240]],
  ["split-complementary", [0, 150, 210]],
  ["complementary", [0, 180]],
];

/**
 * How far a color may sit from an ideal position and still count as being on
 * it. Grading by eye does not land on the degree, and a harmony nobody can hit
 * is not a harmony anybody can use.
 */
export const TOLERANCE_DEGREES = 10;

/**
 * The narrowest gap between two arms of any template above. It bounds how far
 * the pairing may reach, and through that how loose a near miss may be.
 */
export const MIN_ARM_GAP = 60;

/**
 * How far a template may miss and still be worth mentioning: half again as far
 * as a harmony is allowed to.
 *
 * Not twice, which is what it wants to be. The pairing cannot reach a color
 * more than half an arm gap away without putting it in range of two arms, and
 * a shape whose worst color is `d` off can have raw misses spanning `2d` -- so
 * a limit above half of half the arm gap is a promise the search cannot keep,
 * and the extra band would exist in the constant and nowhere else. See ADR-009.
 */
export const NEAR_TOLERANCE_DEGREES = MIN_ARM_GAP / 4;

/**
 * The share of the image a color needs before it can take part. Without it a
 * speck of accent color closes a harmony the frame does not show — and with a
 * yes/no answer that speck decides whether anything is drawn at all.
 */
export const MIN_SHARE = 0.05;

/**
 * How wide an arc neighbouring hues may span and still read as one family. A
 * sixth of the wheel: past it the colors stop looking adjacent and start
 * looking like two ends of something.
 */
export const ANALOGOUS_ARC_DEGREES = 60;

/**
 * Hue is meaningless below this saturation: a near-gray pixel's angle is
 * numerical noise, and a harmony built from noise points the retoucher at
 * nothing.
 */
export const SATURATION_FLOOR = 10;

/**
 * Hue is just as meaningless at the ends of the lightness axis, and saturation
 * does not catch it: `rgb(10, 0, 0)` is a shadow the eye reads as black, yet
 * it is fully saturated and would vote on whether the frame is complementary.
 * A blown highlight does the same at the other end.
 *
 * Detection only. The palette keeps them, because the bar is a picture of the
 * image and a photograph that is two thirds shadow should look like one.
 */
export const LIGHTNESS_FLOOR = 5;
export const LIGHTNESS_CEILING = 95;

const normalizeHue = (hue: number): number => ((hue % 360) + 360) % 360;

/** The shortest way round the wheel between two hues, per ADR-008. */
export const angularDistance = (a: number, b: number): number =>
  Math.abs(signedDistance(a, b));

/**
 * The same distance, but signed: positive when `a` is clockwise of `b`. Which
 * way a color misses its ideal position is what lets the template be slid to
 * sit between the misses rather than on top of one of them.
 */
const signedDistance = (a: number, b: number): number => {
  const difference = normalizeHue(a) - normalizeHue(b);
  if (difference > 180) return difference - 360;
  if (difference <= -180) return difference + 360;
  return difference;
};

interface Candidate {
  /** Where this color sits in the palette the caller passed in. */
  index: number;
  hue: number;
}

/** The colors big enough and colored enough to say anything about hue. */
const candidates = (colors: DominantColor[]): Candidate[] =>
  colors.flatMap(({ hsl, weight }, index) =>
    hsl.s >= SATURATION_FLOOR &&
    hsl.l >= LIGHTNESS_FLOOR &&
    hsl.l <= LIGHTNESS_CEILING &&
    weight >= MIN_SHARE
      ? [{ index, hue: hsl.h }]
      : [],
  );

/**
 * Looks for one color per arm, every arm filled, no color serving twice. The
 * caller has already established that there are exactly as many colors as arms,
 * so a match leaves nothing over: the colors that count *are* the harmony.
 *
 * Allowing leftovers would turn the question into "do some of these colors
 * happen to line up", which any handful of scattered hues answers yes to — and
 * would leave a dominant dot on the wheel that no line touches.
 *
 * The template can sit anywhere on the wheel, not only with an arm exactly on
 * one of the colors. Once the colors are paired with arms, the placement that
 * fits best is the one halfway between the largest miss each way, and it costs
 * half the spread between them. Anchoring an arm on a color instead would mean
 * a palette nudged by a degree loses a harmony that a worse-fitting one keeps.
 */
// How far from a color an arm may sit while the pairing is being worked out.
// Twice the limit in force, because the placement that finally counts can be a
// limit away from any one color. Never past half an arm gap, or one color
// would be in range of two arms and which one claimed it would come down to
// iteration order -- which is why the near tolerance is set where it is.
const searchWindow = (limit: number): number =>
  Math.min(limit * 2, MIN_ARM_GAP / 2);

interface TemplateMatch {
  colorIndices: number[];
  maxDeviation: number;
  /** The colors furthest from where the template wants them. */
  outlierIndices: number[];
}

// The true median, averaged across the two middle values when there are an
// even number of them. Taking one of the two instead would put the median *on*
// a color, and a shape where both colors are equally out of place -- every
// two-armed one -- would look as though only the other were.
const middleOf = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[half]
    : (sorted[half - 1] + sorted[half]) / 2;
};

const matchTemplate = (
  pool: Candidate[],
  offsets: number[],
  limit: number,
): TemplateMatch | null => {
  let best: TemplateMatch | null = null;

  for (const base of pool) {
    const taken = new Set<number>();
    const colorIndices: number[] = [];
    const misses: number[] = [];

    for (const offset of offsets) {
      const arm = normalizeHue(base.hue + offset);
      let nearest: Candidate | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const candidate of pool) {
        if (taken.has(candidate.index)) continue;
        const distance = angularDistance(arm, candidate.hue);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = candidate;
        }
      }

      if (!nearest || nearestDistance > searchWindow(limit)) break;
      taken.add(nearest.index);
      colorIndices.push(nearest.index);
      misses.push(signedDistance(nearest.hue, arm));
    }

    if (colorIndices.length !== offsets.length) continue;

    // Sliding the whole template by the middle of the misses leaves every color
    // half the spread away from its arm, which is the least the worst of them
    // can be.
    const maxDeviation = (Math.max(...misses) - Math.min(...misses)) / 2;
    if (maxDeviation > limit) continue;

    // Measured from the median of the misses, not from the middle of their
    // range: with two colors on their arms and one well off it, every miss is
    // the same distance from the midpoint and the odd one out disappears. The
    // median sits on the colors that agree, which is what the stray one is
    // stray from.
    const median = middleOf(misses);
    const strays = misses.map((miss) => Math.abs(miss - median));
    const worst = Math.max(...strays);

    // Every color that far out, not the first one found to be. Two colors can
    // be equally out of place -- always, in a two-armed shape, where moving
    // either closes it -- and picking one of them would make the answer depend
    // on the order the extractor happened to emit the palette in.
    const outlierIndices = colorIndices.filter((_, at) => strays[at] === worst);

    if (!best || maxDeviation < best.maxDeviation)
      best = { colorIndices, maxDeviation, outlierIndices };
  }

  return best;
};

/**
 * The narrowest arc holding every color that counts, and those colors in the
 * order they sit along it. Found by locating the widest empty gap on the wheel
 * — what is left over is the arc, and the color just past the gap starts it.
 *
 * Measured this way rather than pairwise from the first color: "within a
 * tolerance of the first color" is not "within a tolerance of one hue", and
 * which color comes first is an accident of the extractor's ordering.
 */
const narrowestArc = (
  pool: Candidate[],
): { span: number; ordered: Candidate[] } => {
  const sorted = [...pool].sort((first, second) => first.hue - second.hue);
  let start = 0;
  let widestGap = -1;

  for (let i = 0; i < sorted.length; i += 1) {
    const next = sorted[(i + 1) % sorted.length];
    const gap =
      i === sorted.length - 1
        ? sorted[0].hue + 360 - sorted[i].hue
        : next.hue - sorted[i].hue;
    if (gap > widestGap) {
      widestGap = gap;
      start = (i + 1) % sorted.length;
    }
  }

  return {
    span: sorted.length > 1 ? 360 - widestGap : 0,
    ordered: [...sorted.slice(start), ...sorted.slice(0, start)],
  };
};

/**
 * The harmony a palette shows, or `null` when it shows none. Every template the
 * palette is the right size for is tried, and the one that fits tightest wins.
 *
 * `null` is the ordinary answer, not a failure: most photographs are not built
 * on a color harmony, and saying so is the point of answering yes or no rather
 * than with a percentage.
 */
export const detectHarmony = (colors: DominantColor[]): HarmonyMatch | null => {
  const pool = candidates(colors);
  if (pool.length === 0) return null;

  const { span, ordered } = narrowestArc(pool);

  // One hue with variations: every color that counts fits inside a single
  // tolerance of some hue, which is a span of two tolerances end to end.
  if (span <= TOLERANCE_DEGREES * 2)
    return {
      type: "monochromatic",
      colorIndices: ordered.map(({ index }) => index),
      maxDeviation: span / 2,
      // Span rules, not templates: an arc that is nearly narrow enough is just
      // a wider arc, and there is no vertex to move a color towards.
      nearMiss: null,
    };

  // Neighbouring hues, however many and however spaced. Ordered along the arc
  // so the panel connects them the way the eye travels the wheel, rather than
  // in whatever order the extractor happened to emit them.
  if (span <= ANALOGOUS_ARC_DEGREES)
    return {
      type: "analogous",
      colorIndices: ordered.map(({ index }) => index),
      maxDeviation: span / 2,
      nearMiss: null,
    };

  // Exact first, and only then loosely. Run together, a near-miss triad could
  // outrank a clean complementary on deviation alone and the panel would hedge
  // about a frame that is not in doubt.
  return (
    bestTemplate(pool, TOLERANCE_DEGREES) ??
    bestTemplate(pool, NEAR_TOLERANCE_DEGREES, true)
  );
};

/**
 * The template that fits the pool best inside `limit`, or null when none does.
 * `loose` says the caller is past the ordinary tolerance, which is what makes
 * the answer a near miss rather than a harmony.
 */
const bestTemplate = (
  pool: Candidate[],
  limit: number,
  loose = false,
): HarmonyMatch | null => {
  let best: HarmonyMatch | null = null;

  for (const [type, offsets] of TEMPLATES) {
    // As many colors as arms, no more and no fewer: a template narrower than
    // the palette would leave a color off the shape it is supposed to explain.
    // It also means every template still in the running has the same number of
    // arms, so the only thing left to choose between them is how well they fit.
    if (offsets.length !== pool.length) continue;
    const match = matchTemplate(pool, offsets, limit);
    if (!match) continue;

    const { outlierIndices, ...shape } = match;
    const candidate: HarmonyMatch = {
      type,
      ...shape,
      nearMiss: loose ? { outlierIndices } : null,
    };
    if (!best || candidate.maxDeviation < best.maxDeviation) best = candidate;
  }

  return best;
};

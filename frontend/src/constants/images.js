/**
 * Where every picture in the product goes, and what it is called.
 *
 * ONE PLACE, SO THE ARTWORK AND THE CODE CANNOT DRIFT
 * ──────────────────────────────────────────────────
 * Every slot is named here and referenced from the components. Renaming a
 * file is one edit; adding a slot means adding it here first, which is the
 * point — a picture that exists and is not referenced, or is referenced and
 * does not exist, both show up as a difference against this file.
 *
 * `docs/IMAGE-BRIEF.md` is the companion: same list, with the dimensions and
 * a generation prompt for each. Keep them in step.
 *
 * NOTHING HERE IS REQUIRED
 * ────────────────────────
 * `components/AppImage.jsx` renders the brand tile when a file is absent, so
 * the set can be filled one image at a time and each one lands as an
 * improvement rather than as the end of a broken state.
 *
 * FORMAT: .webp
 * Smaller than JPEG at the same quality and supported everywhere that matters
 * in 2026. Export at the pixel sizes in the brief — twice the CSS size, so
 * they stay sharp on a phone.
 */

const BASE = "/img";

/** One per service category, keyed by the same name the icon registry uses. */
export const CATEGORY_IMAGE = {
  "emergency":        `${BASE}/category/emergency.webp`,
  "home-maintenance": `${BASE}/category/home-maintenance.webp`,
  "cleaning":         `${BASE}/category/cleaning.webp`,
  "healthcare":       `${BASE}/category/healthcare.webp`,
  "education":        `${BASE}/category/education.webp`,
  "moving":           `${BASE}/category/moving.webp`,
  "food":             `${BASE}/category/food.webp`,
  "professional":     `${BASE}/category/professional.webp`,
  "security":         `${BASE}/category/security.webp`,
  "errands":          `${BASE}/category/errands.webp`,
  "elderly":          `${BASE}/category/elderly.webp`,
  "childcare":        `${BASE}/category/childcare.webp`,
  "agro":             `${BASE}/category/agro.webp`,
  "events":           `${BASE}/category/events.webp`,
  "lifestyle":        `${BASE}/category/lifestyle.webp`,
  "repair":           `${BASE}/category/repair.webp`,
  "digital":          `${BASE}/category/digital.webp`,
  "utility":          `${BASE}/category/utility.webp`,
  "beauty":           `${BASE}/category/beauty.webp`,
};

/** Everything that is not a category. */
export const IMG = {
  /** Behind the landing hero, under the existing gradient. */
  heroBackground: `${BASE}/hero/hero-bg.webp`,

  /** The four "how it works" steps, landing page and app. */
  step1Browse:   `${BASE}/steps/step-1-browse.webp`,
  step2Register: `${BASE}/steps/step-2-register.webp`,
  step3Book:     `${BASE}/steps/step-3-book.webp`,
  step4Service:  `${BASE}/steps/step-4-service.webp`,

  /** The trust section on the landing page. */
  trustVerification: `${BASE}/trust/verification.webp`,

  /** Shown to a provider who has not uploaded work samples. */
  portfolioEmpty: `${BASE}/empty/portfolio.webp`,

  /** Link previews. Referenced from index.html, not from a component. */
  ogShare: `${BASE}/social/og-share.webp`,
};

/**
 * A stable colour per person, derived from their name.
 *
 * Not artwork — this is what a provider or customer WITHOUT a photo gets, and
 * it has to be better than a grey circle. The same name always produces the
 * same colour, so a face you have seen before stays recognisable in a list.
 *
 * Drawn from the category palette, which is already solved for equal visual
 * weight, so no avatar shouts louder than its neighbour.
 */
const AVATAR_COLOURS = [
  "#DD392E", "#C85321", "#AA681C", "#947318", "#3C8816", "#1A8A16",
  "#168A31", "#168488", "#1B80A5", "#217AC9", "#3C73DF", "#5D6BE5",
  "#7564E6", "#8C5AE4", "#A54BE2", "#C429DC", "#D222BB", "#DB2492",
  "#DD2F69",
];

export function avatarColour(name) {
  const s = String(name || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}

/**
 * The letters shown on that colour. One for a single name, two for a name
 * with parts — "মো. রাকিব হোসেন" gives "মর", which reads as a person rather
 * than as a database row.
 */
export function avatarInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}

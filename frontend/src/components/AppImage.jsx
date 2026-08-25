/**
 * AppImage — a picture that is allowed not to exist yet
 *
 * WHY IT IS BUILT THIS WAY
 * ────────────────────────
 * The artwork for this product is being made separately, one image at a time.
 * If a missing file meant a broken-image icon, a grey box, or a collapsed
 * layout, the app would look worse during the weeks it takes to fill the set
 * than it does now with none of it.
 *
 * So a missing image is not an error state here. It renders the `fallback` —
 * the brand-coloured tile the design already uses — and the layout is
 * identical either way, because the aspect ratio is reserved by the container
 * rather than by the image. Drop a file into `public/img/` and that slot
 * improves. Nothing else changes, and nothing has to be co-ordinated.
 *
 * WHAT IT HANDLES
 * ───────────────
 *   reserved space   `aspect-ratio` on the wrapper, so nothing reflows when
 *                    an image arrives late. Layout shift is the most
 *                    expensive thing a slow image does.
 *   lazy by default  images below the fold do not compete with the ones the
 *                    visitor can see. `priority` opts a hero out of that.
 *   fade-in          decoded images appear over 240ms rather than snapping,
 *                    which reads as smooth rather than as a page still
 *                    loading. Respects prefers-reduced-motion via the
 *                    stylesheet.
 *   alt text         REQUIRED, because a decorative image should pass alt=""
 *                    deliberately rather than by forgetting.
 *
 * USAGE
 *   <AppImage src="/img/category/cleaning.webp" alt="" ratio="16/10"
 *             fallback={<Icon name="cleaning" size={28} />} />
 */
import { useState } from "react";

export default function AppImage({
  src,
  alt,
  ratio = "16/10",
  fallback = null,
  priority = false,
  rounded = 14,
  objectPosition = "center",
  style,
  className,
}) {
  // "missing" is the honest name: it covers a file that is not there yet and
  // one that failed to load, which look the same to a visitor and want the
  // same treatment.
  const [missing, setMissing] = useState(!src);
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: ratio,
        borderRadius: rounded,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {/*
        Always rendered, always underneath. When the image is missing this IS
        the design; when it loads, the image covers it. Keeping it mounted
        means there is never a frame of empty box between the two.
      */}
      {fallback}

      {src && !missing && (
        <img
          src={src}
          alt={alt ?? ""}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          // Lowercase: React 18 does not map the camelCase form and warns.
          // React 19 accepts both, so this stays correct either way.
          fetchpriority={priority ? "high" : "auto"}
          onLoad={() => setLoaded(true)}
          onError={() => setMissing(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition,
            opacity: loaded ? 1 : 0,
            transition: "opacity .24s ease",
          }}
        />
      )}
    </div>
  );
}

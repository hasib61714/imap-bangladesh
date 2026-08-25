/**
 * EmptyState — what a screen shows when there is genuinely nothing yet
 *
 * WHY THIS EXISTS
 * ───────────────
 * Several screens filled themselves with fabricated data when the API had
 * nothing to show:
 *
 *     const displayTxns = apiTxns != null ? apiTxns : TRANSACTIONS;
 *     const [paReviews, setPaReviews] = useState(PA_REVIEWS);
 *     const friends = rfData.friends || RF_FRIENDS;
 *
 * So a new customer opened the wallet and saw a ৳1,000 top-up they never
 * made. A provider with no reviews saw five stars from "Rahim U.", who does
 * not exist. A user with no referrals saw three friends they never invited.
 *
 * That is not a placeholder. It is the product telling the user something
 * untrue about their own account, in the two areas — money and reputation —
 * where being trusted is the entire proposition. And it hides real failures:
 * if the wallet endpoint is down, the fallback shows a healthy-looking
 * transaction list and nobody finds out.
 *
 * An empty state is the honest answer, and done properly it is also the more
 * professional one. Real products show you an empty inbox; they do not
 * invent mail.
 *
 * THE THREE STATES THIS COVERS
 * ────────────────────────────
 * They are different and users act on them differently:
 *
 *     nothing yet    you have no transactions — here is how to make one
 *     no results     your filter matched nothing — here is how to widen it
 *     failed         we could not load this — here is how to retry
 *
 * Collapsing "failed" into "empty" is how a broken endpoint goes unnoticed
 * for weeks, so `tone="error"` says so plainly and offers the retry.
 */
import Icon from "./Icon";

/**
 * @param {object}   props
 * @param {string}  [props.icon]        a name from components/Icon.jsx
 * @param {string}   props.title        one short line: what is true
 * @param {string}  [props.description] one or two lines: what to do about it
 * @param {string}  [props.actionLabel] the button, when there is a next step
 * @param {Function}[props.onAction]
 * @param {"neutral"|"error"} [props.tone]
 * @param {object}   props.C            theme tokens
 * @param {boolean} [props.compact]     for inside a card rather than a page
 */
export default function EmptyState({
  icon = "empty",
  title,
  description,
  actionLabel,
  onAction,
  tone = "neutral",
  C,
  compact = false,
}) {
  const isError = tone === "error";
  const accent = isError ? (C.red || "#DC2626") : C.muted;

  return (
    <div
      // Announced when it replaces a list the user was waiting for, which is
      // the moment they need to know there is nothing rather than nothing yet.
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: compact ? "28px 20px" : "56px 24px",
        gap: 6,
      }}
    >
      <div
        style={{
          width: compact ? 48 : 64,
          height: compact ? 48 : 64,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isError ? `${accent}14` : C.plt,
          color: accent,
          marginBottom: 10,
        }}
      >
        <Icon name={isError ? "warning" : icon} size={compact ? 22 : 28} />
      </div>

      <div style={{ fontSize: compact ? 14 : 16, fontWeight: 700, color: C.text }}>
        {title}
      </div>

      {description && (
        <div style={{
          fontSize: compact ? 12.5 : 13.5,
          color: C.sub,
          maxWidth: 340,
          lineHeight: 1.6,
        }}>
          {description}
        </div>
      )}

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: 14,
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: isError ? accent : C.p,
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            // The interface has a 44px touch target rule; a call to action
            // inside an empty state is exactly where a thumb goes.
            minHeight: 40,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

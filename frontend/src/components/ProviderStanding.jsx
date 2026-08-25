/**
 * ProviderStanding — "am I visible to customers, and if not, why not?"
 *
 * WHY THIS EXISTS
 * ───────────────
 * A provider had no way to ask. They applied, uploaded documents, and then
 * saw nothing: no state, no reason, no idea whether anyone had looked. The
 * customer app's become-a-provider flow ended on a screen that promised
 * review "within 24–48 hours" and printed a reference number
 * (`APP-` + a timestamp) that nothing stored — so a person quoting it to
 * support was quoting a number support could not look up.
 *
 * Support could not answer the question either. The only column they could
 * read was `is_approved`, which since I-07 is a compatibility mirror rather
 * than the answer, so "it says approved" and "customers can see you" had
 * quietly stopped meaning the same thing.
 *
 * Two real sources answer it now:
 *
 *   verification.mine()        the person's own case: the state and, where
 *                              it was refused, the reason in the reviewer's
 *                              own words (R-1103)
 *   listing.eligibility(id)    TRUST-ARCHITECTURE §5's conjunction, clause
 *                              by clause
 *
 * Shared between the provider portal and the customer app, because a person
 * who applies keeps the `customer` role — applying does not grant it — and
 * would otherwise never see any of this.
 */
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { verification as verificationApi, listing as listingApi } from "../api";

/** Every clause, said in words a provider can act on rather than as a column name. */
const CLAUSE_COPY = {
  identity_verified: {
    bn: "পরিচয় যাচাই", en: "Identity verified",
    fixBn: "NID ও সেলফি জমা দিন", fixEn: "Submit your NID and a selfie",
  },
  has_capability: {
    bn: "সেবার ধরন দেওয়া আছে", en: "Service type given",
    fixBn: "প্রোফাইলে সেবার ধরন লিখুন", fixEn: "Add your service type in your profile",
  },
  has_coverage: {
    bn: "এলাকা দেওয়া আছে", en: "Area given",
    fixBn: "প্রোফাইলে এলাকা লিখুন", fixEn: "Add your area in your profile",
  },
  has_price: {
    bn: "ঘণ্টার রেট দেওয়া আছে", en: "Hourly rate set",
    fixBn: "প্রোফাইলে রেট দিন", fixEn: "Set your rate in your profile",
  },
  not_suspended: {
    bn: "অ্যাকাউন্ট সক্রিয়", en: "Account active",
    fixBn: "সহায়তার সাথে যোগাযোগ করুন", fixEn: "Contact support",
  },
  human_approved: {
    bn: "IMAP-এর অনুমোদন", en: "Approved by IMAP",
    fixBn: "পরিচয় যাচাইয়ের পর আমরা পর্যালোচনা করি", fixEn: "We review this once your identity is verified",
  },
};

/**
 * What each state means, in the second person.
 *
 * No promised turnaround. The old copy said "within 24–48 hours" while F-12
 * meant nothing could approve an application at all; there is a real path
 * now and still no agreed service level, so these say what is true — what
 * has happened and what happens next — and do not invent a deadline.
 */
const STATE_COPY = {
  not_submitted: { icon: "identity", tone: null,
    bn: "পরিচয় যাচাই শুরু করুন", en: "Start identity verification",
    subBn: "NID এবং একটি সেলফি লাগবে — দুই মিনিটের কাজ।",
    subEn: "You need your NID and a selfie. It takes about two minutes." },
  submitted: { icon: "pending", tone: "#F59E0B",
    bn: "যাচাইয়ের অপেক্ষায়", en: "Waiting for review",
    subBn: "আমরা আপনার নথি পেয়েছি। একজন মানুষ সেগুলো দেখবেন।",
    subEn: "We have your documents. A person will look at them." },
  under_review: { icon: "review-queue", tone: "#3B82F6",
    bn: "পর্যালোচনা চলছে", en: "Being reviewed",
    subBn: "একজন পর্যালোচক এখন আপনার নথি দেখছেন।",
    subEn: "A reviewer is looking at your documents now." },
  more_info: { icon: "edit", tone: "#3B82F6",
    bn: "আরও তথ্য দরকার", en: "More information needed",
    subBn: "নিচের মন্তব্যটি পড়ে আবার জমা দিন।",
    subEn: "Read the note below, then submit again." },
  verified: { icon: "success", tone: "#00C170",
    bn: "পরিচয় যাচাই সম্পন্ন", en: "Identity verified",
    subBn: "আপনার পরিচয় নিশ্চিত করা হয়েছে।",
    subEn: "Your identity has been confirmed." },
  rejected: { icon: "warning", tone: "#EF4444",
    bn: "যাচাই প্রত্যাখ্যাত", en: "Verification rejected",
    subBn: "কারণটি পড়ুন, সংশোধন করুন, আবার জমা দিন।",
    subEn: "Read the reason, fix it, and submit again." },
  revoked: { icon: "warning", tone: "#EF4444",
    bn: "যাচাই বাতিল করা হয়েছে", en: "Verification revoked",
    subBn: "কারণটি নিচে দেওয়া আছে।", subEn: "The reason is below." },
  expired: { icon: "pending", tone: null,
    bn: "যাচাইয়ের মেয়াদ শেষ", en: "Verification expired",
    subBn: "আবার জমা দিন।", subEn: "Please submit again." },
};

export default function ProviderStanding({ C, lang, providerId, onOpenKyc, compact = false }) {
  const [verification, setVerification] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await verificationApi.mine();
        if (alive) setVerification(v);
      } catch { /* an unreachable status is not worth an error screen */ }
      if (providerId) {
        try {
          const e = await listingApi.eligibility(providerId);
          if (alive) setEligibility(e);
        } catch { /* the same */ }
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [providerId]);

  if (loading || (!verification && !eligibility)) return null;

  const state = (verification && verification.state) || "not_submitted";
  const sc = STATE_COPY[state] || STATE_COPY.not_submitted;
  const tone = sc.tone || C.muted;
  const listable = eligibility && eligibility.listable;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.bdr}`, borderLeft: `4px solid ${tone}`,
      borderRadius: 14, padding: compact ? 14 : 18, marginBottom: 22,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ fontSize: 30, lineHeight: 1 }}><Icon name={sc.icon} size={30} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: tone }}>
            {lang === "bn" ? sc.bn : sc.en}
          </div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3, lineHeight: 1.55 }}>
            {lang === "bn" ? sc.subBn : sc.subEn}
          </div>

          {/* The reviewer's own words. This is what R-1103 is for: a refusal
              a person cannot read is one they cannot answer. */}
          {verification && verification.reason && (
            <div style={{
              marginTop: 10, background: `${tone}12`, border: `1px solid ${tone}33`,
              borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: C.text, lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: tone, marginBottom: 3 }}>
                {lang === "bn" ? "পর্যালোচকের মন্তব্য" : "Note from the reviewer"}
              </div>
              {verification.reason}
            </div>
          )}

          {verification && verification.can_submit && onOpenKyc && (
            <button onClick={onOpenKyc} style={{
              marginTop: 12, background: C.p, color: "#fff", border: "none", borderRadius: 10,
              padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {state === "not_submitted"
                ? (lang === "bn" ? "যাচাই শুরু করুন" : "Start verification")
                : (lang === "bn" ? "আবার জমা দিন" : "Submit again")}
            </button>
          )}
        </div>
      </div>

      {eligibility && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.bdr}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>
              {lang === "bn" ? "গ্রাহকরা আপনাকে দেখতে পাচ্ছেন?" : "Can customers see you?"}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 99,
              background: listable ? "#00C17018" : "#8FAAA018",
              color: listable ? "#00C170" : C.muted,
            }}>
              {listable ? (lang === "bn" ? "হ্যাঁ" : "Yes") : (lang === "bn" ? "এখনও নয়" : "Not yet")}
            </span>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {(eligibility.clauses || []).map((c) => {
              const copy = CLAUSE_COPY[c.clause];
              if (!copy) return null;
              return (
                <div key={c.clause} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5 }}>
                  <span style={{ color: c.ok ? "#00C170" : C.muted, fontWeight: 700, lineHeight: 1.5 }}>
                    {c.ok ? "" : "○"}
                  </span>
                  <span style={{ color: c.ok ? C.sub : C.text, lineHeight: 1.5 }}>
                    {lang === "bn" ? copy.bn : copy.en}
                    {!c.ok && (
                      <span style={{ color: C.muted }}>
                        {" — "}{lang === "bn" ? copy.fixBn : copy.fixEn}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* `is_available` is the provider's OWN switch, so it is reported
              apart from the clauses the platform decides. Being switched off
              is a choice, not a failure. */}
          {eligibility.is_available === false && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#F59E0B" }}>
              {lang === "bn"
                ? "আপনি নিজেকে “উপলব্ধ নই” করে রেখেছেন — সুইচটি চালু করলেই আবার দেখা যাবে।"
                : "You have switched yourself to unavailable — turn the toggle back on to reappear."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

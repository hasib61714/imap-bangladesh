/**
 * Icon — one place that decides what a thing looks like
 *
 * WHY THIS EXISTS
 * ───────────────
 * The interface used emoji as its icon set: 🚨 for emergency, 🔧 for repair,
 * 💳 for a card, 🎉 on the confirmation screen. Nearly 1,400 of them across
 * 48 files.
 *
 * Emoji are not an icon set, and the reasons are practical rather than a
 * matter of taste:
 *
 *   They are not yours. Every platform draws them differently — 🧹 is a
 *   grey besom on Windows and a straw broom on Apple — so the product looks
 *   different on every device and you cannot correct it.
 *
 *   They do not take your colours. An emoji ignores `color`, so it cannot
 *   sit in a brand-tinted tile, cannot dim when disabled, and cannot go white
 *   on a dark button. Every emoji is a small, differently-coloured picture.
 *
 *   They do not align. Emoji are drawn on their own baseline with their own
 *   padding, so a row of them never lines up and the spacing has to be
 *   nudged per icon.
 *
 *   They read as informal. Not always wrong — but a platform that holds
 *   national ID documents and moves money is not a chat message, and 🎉 on
 *   a payment confirmation is the wrong register.
 *
 *   Screen readers announce them. `🚨` is read aloud as "police car light",
 *   inside a button already labelled "Emergency".
 *
 * A single line-art set fixes all five at once: one drawing everywhere, it
 * inherits `currentColor`, it aligns on a common grid, and it is a shape
 * rather than a picture.
 *
 * HOW TO USE IT
 * ─────────────
 *     <Icon name="emergency" size={24} />
 *     <Icon name="wallet" size={18} color={C.p} />
 *
 * Names are SEMANTIC — "emergency", not "siren". The name says what the thing
 * IS, so the drawing can be replaced without touching a call site. That is
 * the whole point of the indirection: swapping the icon set later is one edit
 * to the registry below.
 *
 * `aria-hidden` is set on every icon. An icon beside a label is decoration
 * and announcing it repeats the label; an icon that is the ONLY content of a
 * control needs a label on the control, not on the icon.
 */
import {
  // ── Service categories ─────────────────────────────────────
  AlertOutlined, ToolOutlined, ClearOutlined, MedicineBoxOutlined,
  ReadOutlined, CarOutlined, CoffeeOutlined, SolutionOutlined,
  SafetyOutlined, ShoppingOutlined, HeartOutlined, SmileOutlined,
  EnvironmentOutlined, GiftOutlined, SkinOutlined, SettingOutlined,
  BulbOutlined, ExperimentOutlined, ScissorOutlined,
  // ── Money ──────────────────────────────────────────────────
  WalletOutlined, CreditCardOutlined, DollarOutlined, BankOutlined,
  MobileOutlined, TransactionOutlined,
  // ── Identity and trust ─────────────────────────────────────
  IdcardOutlined, SafetyCertificateOutlined, LockOutlined, FileProtectOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  ClockCircleOutlined, EyeOutlined, AuditOutlined,
  // ── Navigation and chrome ──────────────────────────────────
  HomeOutlined, SearchOutlined, UserOutlined, TeamOutlined, BellOutlined,
  MessageOutlined, CalendarOutlined, DashboardOutlined, MenuOutlined,
  ArrowLeftOutlined, ArrowRightOutlined, PlusOutlined, CloseOutlined,
  DownOutlined, UpOutlined, MoreOutlined, LogoutOutlined, GlobalOutlined,
  // ── Status and feedback ────────────────────────────────────
  StarOutlined, StarFilled, TrophyOutlined, CrownOutlined, RiseOutlined,
  ThunderboltOutlined, FireOutlined, LoadingOutlined, InboxOutlined,
  SunOutlined, MoonOutlined, PhoneOutlined, MailOutlined, PictureOutlined,
  CameraOutlined, UploadOutlined, DeleteOutlined, EditOutlined,
  ShareAltOutlined, LinkOutlined, InfoCircleOutlined, QuestionCircleOutlined,
  BookOutlined, ShopOutlined, CustomerServiceOutlined, RocketOutlined,
  FontSizeOutlined, FileDoneOutlined,
  // Added while converting the remaining screens
  AudioOutlined, WifiOutlined, FileTextOutlined, PrinterOutlined,
  FolderOpenOutlined, AimOutlined, LikeOutlined, HighlightOutlined,
  CheckOutlined, CaretRightOutlined, DownloadOutlined, SyncOutlined,
  FlagOutlined, TagOutlined, StopOutlined, SendOutlined, PlusCircleOutlined,
} from "@ant-design/icons";

/**
 * Semantic name → drawing.
 *
 * The emoji each one replaces is in the comment, so a reviewer can check the
 * substitution rather than take it on trust.
 */
const REGISTRY = {
  // ── The 19 service categories (constants/data.js) ───────────
  "emergency":        AlertOutlined,           // 🚨
  "home-maintenance": ToolOutlined,            // 🏠 — the SERVICE is repair, not a house
  "cleaning":         ClearOutlined,           // 🧹
  "healthcare":       MedicineBoxOutlined,     // 👩‍⚕️
  "education":        ReadOutlined,            // 📚
  "moving":           CarOutlined,             // 🚚
  "food":             CoffeeOutlined,          // 🍲
  "professional":     SolutionOutlined,        // 🧑‍💼
  "security":         SafetyOutlined,          // 🛡️
  "errands":          ShoppingOutlined,        // 🛒
  "elderly":          HeartOutlined,           // 🧓 — care, not age
  "childcare":        SmileOutlined,           // 👶
  "agro":             EnvironmentOutlined,     // 🌾
  "events":           GiftOutlined,            // 🎉
  "lifestyle":        SkinOutlined,            // 🧵
  "repair":           SettingOutlined,         // 🔧
  "digital":          BulbOutlined,            // 🧠 — help, not a brain
  "utility":          ExperimentOutlined,      // 🚿
  "beauty":           ScissorOutlined,         // 💅

  // ── Trades, for search chips and provider skills ───────────
  "electrician":      ThunderboltOutlined,     // ⚡
  "plumber":          ToolOutlined,            // 🔧
  "ac-repair":        ExperimentOutlined,      // ❄️
  "tutor":            ReadOutlined,            // 📚
  "nurse":            MedicineBoxOutlined,     // 🏥

  // ── Money ──────────────────────────────────────────────────
  "wallet":           WalletOutlined,          // 💳
  "card":             CreditCardOutlined,      // 💳
  "cash":             DollarOutlined,          // 💵
  "bank":             BankOutlined,            // 🏦
  "mobile-banking":   MobileOutlined,          // 📱 — bKash, Nagad, Rocket
  "transaction":      TransactionOutlined,     // 💸
  "earnings":         RiseOutlined,            // 📈

  // ── Identity and trust ─────────────────────────────────────
  "identity":         IdcardOutlined,          // 🆔
  "verified":         SafetyCertificateOutlined, // ✅ on a trust claim
  "locked":           LockOutlined,            // 🔒
  "document":         FileProtectOutlined,     // 📄
  "audit":            AuditOutlined,           // 📋
  "review-queue":     EyeOutlined,             // 👀

  // ── Status ─────────────────────────────────────────────────
  "success":          CheckCircleOutlined,     // ✅ 🎉
  "error":            CloseCircleOutlined,     // ❌
  "warning":          ExclamationCircleOutlined, // ⚠️
  "pending":          ClockCircleOutlined,     // ⏳
  "info":             InfoCircleOutlined,      // ℹ️
  "help":             QuestionCircleOutlined,  // ❓
  "loading":          LoadingOutlined,
  "empty":            InboxOutlined,           // the empty state's own icon

  // ── Navigation and chrome ──────────────────────────────────
  "home":             HomeOutlined,            // 🏠
  "search":           SearchOutlined,          // 🔍
  "user":             UserOutlined,            // 👤
  "team":             TeamOutlined,            // 👥
  "notification":     BellOutlined,            // 🔔
  "chat":             MessageOutlined,         // 💬
  "calendar":         CalendarOutlined,        // 📅
  "dashboard":        DashboardOutlined,       // 📊
  "menu":             MenuOutlined,            // ☰
  "back":             ArrowLeftOutlined,       // ←
  "forward":          ArrowRightOutlined,      // →
  "add":              PlusOutlined,            // ➕
  "close":            CloseOutlined,           // ✕
  "down":             DownOutlined,
  "up":               UpOutlined,
  "more":             MoreOutlined,            // ⋯
  "logout":           LogoutOutlined,          // 🚪
  "language":         GlobalOutlined,          // 🌐
  "settings":         SettingOutlined,         // ⚙️

  // ── Content ────────────────────────────────────────────────
  "star":             StarOutlined,            // ⭐
  "star-filled":      StarFilled,              // ★
  "trophy":           TrophyOutlined,          // 🏆
  "premium":          CrownOutlined,           // 👑 💎
  "hot":              FireOutlined,            // 🔥
  "light":            SunOutlined,             // ☀️
  "dark":             MoonOutlined,            // 🌙
  "phone":            PhoneOutlined,           // 📞
  "email":            MailOutlined,            // ✉️
  "image":            PictureOutlined,         // 🖼️
  "camera":           CameraOutlined,          // 📷
  "upload":           UploadOutlined,          // 📤
  "delete":           DeleteOutlined,          // 🗑️
  "edit":             EditOutlined,            // ✏️
  "share":            ShareAltOutlined,        // 📲
  "link":             LinkOutlined,            // 🔗
  "course":           BookOutlined,            // 📖
  "shop":             ShopOutlined,            // 🏪
  "support":          CustomerServiceOutlined, // 🎧
  "launch":           RocketOutlined,          // 🚀
  "location":         EnvironmentOutlined,     // 📍
  "gift":             GiftOutlined,            // 🎁
  "referral":         ShareAltOutlined,        // 📲
  "loyalty":          TrophyOutlined,          // 🏆
  "blood":            HeartOutlined,           // 🩸
  "disaster":         AlertOutlined,           // 🌊

  // Elderly MODE is an accessibility setting — larger type — and is a
  // different thing from the elderly-care service category above. They shared
  // 👴 and should not share an icon.
  "large-text":       FontSizeOutlined,        // 👴 on the accessibility toggle

  // The trust section's "Full Legal Protection" card. ⚖️ has no line-art
  // equivalent in this set; a signed document is the nearer idea anyway.
  "legal":            FileDoneOutlined,        // ⚖️

  // ── The rest of the app ─────────────────────────────────────
  "mic":              AudioOutlined,           // 🎙️
  "live":             WifiOutlined,            // 📡 — a live feed, not a dish
  "receipt":          FileTextOutlined,        // 🧾
  "print":            PrinterOutlined,         // 🖨️
  "folder":           FolderOpenOutlined,      // 🗂️
  "target":           AimOutlined,             // 🎯
  "thanks":           LikeOutlined,            // 🙏 👋
  "sign":             HighlightOutlined,       // ✍️
  "check":            CheckOutlined,           // ✓ — the bare mark, not the circled one
  "chevron":          CaretRightOutlined,      // ➤
  "download":         DownloadOutlined,        // ⬇️
  "refresh":          SyncOutlined,            // 🔄
  "flag":             FlagOutlined,            // 🚩
  "tag":              TagOutlined,             // 🏷️ 🎟️
  "blocked":          StopOutlined,            // 🚫
  "send":             SendOutlined,            // ➤ in a chat
  "add-circle":       PlusCircleOutlined,      // ➕
};

/** Names the registry knows, for the test that keeps data.js in step with it. */
export const ICON_NAMES = Object.keys(REGISTRY);

/**
 * @param {object}  props
 * @param {string}  props.name   a key from REGISTRY
 * @param {number} [props.size]  px; sets font-size, which the SVG follows
 * @param {string} [props.color] any CSS colour; the drawing inherits it
 * @param {object} [props.style] merged last, so a caller can always override
 */
export default function Icon({ name, size = 18, color, style, className, ...rest }) {
  const Glyph = REGISTRY[name];

  if (!Glyph) {
    /**
     * Two different failures, wearing the same face.
     *
     * A FALSY name means no icon was specified — `icon: n.icon || ""` where
     * the API returned nothing. The row is fine; it just has no mark. It gets
     * a neutral one, because a gap in a list of icons reads as broken while a
     * neutral dot reads as "nothing particular".
     *
     * A non-empty name that is not registered is a TYPO, and that should stay
     * visibly absent — filling it with a default would hide the mistake
     * behind something plausible. It keeps the empty box, and the build-time
     * check in scripts/check-icons.mjs fails on it.
     */
    if (!name) {
      return (
        <InfoCircleOutlined
          aria-hidden="true"
          style={{ fontSize: size, color: color || "currentColor", opacity: 0.45,
                   lineHeight: 1, verticalAlign: "middle", ...style }}
        />
      );
    }
    if (import.meta.env.DEV) {
      console.warn(`[Icon] no icon registered for "${name}" — add it to components/Icon.jsx`);
    }
    return <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size }} />;
  }

  return (
    <Glyph
      aria-hidden="true"
      className={className}
      style={{
        fontSize: size,
        color,
        // Icons sit beside text constantly. Without this they ride the
        // baseline and push the line height around.
        lineHeight: 1,
        verticalAlign: "middle",
        ...style,
      }}
      {...rest}
    />
  );
}

import { useState, useEffect } from "react";
import {
  Layout, Menu, Table, Card, Button, Input, Tag, Badge,
  Switch, Select, Modal, Form, Typography, Space, Statistic,
  Row, Col, Progress, Avatar, message, ConfigProvider,
  theme as antTheme, Popconfirm, Alert
} from "antd";
import {
  DashboardOutlined, TeamOutlined, UserOutlined, BookOutlined,
  SafetyCertificateOutlined, BarChartOutlined, WarningOutlined,
  NotificationOutlined, GiftOutlined, AppstoreOutlined, SettingOutlined,
  LogoutOutlined, CheckOutlined, CloseOutlined, SearchOutlined,
  PlusOutlined, SendOutlined, DeleteOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, SunOutlined, MoonOutlined
} from "@ant-design/icons";
import { T } from "../constants/translations";
import { admin as adminApi, ai as aiApi, sos as sosApi, payments as paymentsApi, services as servicesApi, loans as loansApi,
         verification as verificationApi, listing as listingApi } from "../api";

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const escHtml = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

/* ─── Status Tag ─────────────────────────────────────── */
const StatusTag = ({ status, lang }) => {
  const map = {
    active:    { color: "success",    lbn: "সক্রিয়",       len: "Active"    },
    pending:   { color: "warning",    lbn: "অপেক্ষায়",     len: "Pending"   },
    rejected:  { color: "error",      lbn: "প্রত্যাখ্যাত", len: "Rejected"  },
    suspended: { color: "error",      lbn: "বন্ধ",          len: "Suspended" },
    completed: { color: "success",    lbn: "সম্পন্ন",       len: "Completed" },
    ongoing:   { color: "processing", lbn: "চলমান",         len: "Ongoing"   },
    cancelled: { color: "default",    lbn: "বাতিল",         len: "Cancelled" },
    verified:  { color: "success",    lbn: "যাচাইকৃত",     len: "Verified"  },

    // The verification machine's states (STATE-MACHINES §9). Without these
    // the tag fell through to `m.lbn = status` and rendered the raw English
    // identifier — a Bangla-first product showing "submitted" and
    // "under_review" to a Bangla-speaking reviewer.
    submitted:    { color: "warning",    lbn: "অপেক্ষায়",          len: "Waiting"      },
    under_review: { color: "processing", lbn: "পর্যালোচনায়",       len: "In review"    },
    more_info:    { color: "blue",       lbn: "তথ্য চাওয়া হয়েছে", len: "Info needed"  },
    revoked:      { color: "error",      lbn: "বাতিল করা হয়েছে",  len: "Revoked"      },
    expired:      { color: "default",    lbn: "মেয়াদোত্তীর্ণ",     len: "Expired"      },
    not_submitted:{ color: "default",    lbn: "জমা দেওয়া হয়নি",  len: "Not submitted"},

    // Provider listing states.
    applied:      { color: "warning",    lbn: "আবেদন করেছেন",      len: "Applied"      },
    approved:     { color: "success",    lbn: "অনুমোদিত",          len: "Approved"     },
  };
  const m = map[status] || { color: "default", lbn: status, len: status };
  return <Tag color={m.color}>{lang === "bn" ? m.lbn : m.len}</Tag>;
};

export default function AdminPanel({ user, onLogout, dark, setDark, lang, setLang }) {
  const tr = T[lang] || T.bn;
  const [tab, setTab]             = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile]   = useState(() => window.innerWidth <= 768);
  const [messageApi, ctx]         = message.useMessage();

  // Hide splash screen on mount
  useEffect(() => { if(typeof window.hideSplash==="function") window.hideSplash(); }, []);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const toast = (msg, type = "success") => messageApi[type](msg);

  /* ── REAL STATS FROM API ──────────────────────────── */
  const [realStats,  setRealStats]      = useState(null);
  const [monthlyRev2, setMonthlyRev2]  = useState([]);

  useEffect(()=>{
    adminApi.stats().then(d=>setRealStats(d)).catch(()=>{});
    adminApi.revenue().then(d=>{
      if(d?.monthly?.length){
        setMonthlyRev2(d.monthly.slice(0,6).reverse().map(m=>({
          m: m.month?.slice(5)||m.month||"",
          v: parseFloat(m.revenue||0),
          b: parseInt(m.bookings||0),
        })));
      }
    }).catch(()=>{});
    adminApi.complaints().then(list=>{
      if(Array.isArray(list)&&list.length){
        setTickets(list.map(c=>({
          id: `DSP-${c.id}`,
          _rawId: c.id,
          customer: c.user_name||c.user_id||"—",
          provider: c.booking_id?`BK-${c.booking_id}`:"—",
          issue: c.subject||c.description||"অভিযোগ",
          status: c.status==="resolved"||c.status==="closed"?c.status:"open",
          date: c.created_at?c.created_at.slice(0,10):"-",
          priority: c.priority||"medium",
        })));
      }
    }).catch(()=>{});
  },[]);

  /* ── DATA ─────────────────────────────────────────── */
  /**
   * EMPTY, NOT INVENTED.
   *
   * These four lists used to be initialised with five fabricated people
   * each — names, phone numbers, NID numbers, bookings — and every loader
   * below guarded its update with `if (d?.x?.length)`. So when the real API
   * returned NOTHING, the invented rows stayed on screen: an operator saw
   * five KYC applications that did not exist and could click Approve on
   * them. The panel was not showing stale data; it was showing fiction and
   * offering to act on it.
   *
   * They start empty, the loaders always replace, and each tab renders an
   * explicit empty state. An operator who sees nothing is being told the
   * truth: there is nothing.
   */
  const [providers, setProviders] = useState([]);
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [kycFilter, setKycFilter]       = useState("all");
  const [kycRejectModal, setKycRejectModal] = useState({ open:false, id:null });
  const [kycRejectReason, setKycRejectReason] = useState("");
  const [kycList, setKycList] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketFilter, setTicketFilter] = useState("all");
  const [announcements, setAnnouncements] = useState([]);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMsg,   setNotifMsg]   = useState("");
  const [notifTarget,setNotifTarget]= useState("all");
  const [notifSending, setNotifSending] = useState(false);
  const [promoSaving,  setPromoSaving]  = useState(false);
  const [promos, setPromos] = useState([]);
  const [promoForm, setPromoForm] = useState({ code:"", discount:"", type:"percent", limit:"" });
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState({ icon:"", name:"" });
  const [sysToggles, setSysToggles] = useState([true, false, true, true, true, false]);
  const [pSearch, setPSearch] = useState("");
  const [uSearch, setUSearch] = useState("");
  const [bSearch, setBSearch] = useState("");

  /* ── ACTIONS ──────────────────────────────────────── */
  /**
   * The provider listing decisions.
   *
   * WHAT THESE USED TO DO
   * ─────────────────────
   *   setProviders(... status: "active" ...);
   *   toast("✅ Approved!");
   *   try { await adminApi.updateUser(id, { is_active: 1 }); } catch { console.warn }
   *
   * `is_active` is the USER ACCOUNT. Setting it did not make a provider
   * listable and never had — F-12 recorded that no endpoint could. So the
   * button said "Approved!", activated an account, and left the provider
   * exactly as invisible as before. The failure was swallowed too.
   *
   * They now call the real listing endpoints, which require a verified
   * identity case before approving (TRUST §6) and a stated reason before
   * refusing or suspending (R-1103).
   */
  const [listingBusy, setListingBusy] = useState(null);
  const [listingModal, setListingModal] = useState({ open: false, id: null, mode: null });
  const [listingReason, setListingReason] = useState("");

  const runListing = async (providerId, fn, successMsg, tone = "success") => {
    if (listingBusy) return false;
    setListingBusy(providerId);
    try {
      await fn();
      await loadProviders(pSearch);
      toast(successMsg, tone);
      return true;
    } catch (e) {
      toast(failure(e), "error");
      return false;
    } finally {
      setListingBusy(null);
    }
  };

  const approveProvider = (row) =>
    runListing(row._pid, () => listingApi.approve(row._pid),
      lang === "bn" ? "✅ তালিকাভুক্ত করা হয়েছে" : "✅ Now listed");

  const submitListingDecision = async () => {
    const reason = listingReason.trim();
    if (reason.length < 10) {
      toast(lang === "bn"
        ? "কারণ লিখুন — অন্তত ১০ অক্ষর। প্রদানকারী এটি দেখবেন।"
        : "Write a reason — at least 10 characters. The provider sees it.", "warning");
      return;
    }
    const { id, mode } = listingModal;
    const ok = await runListing(id,
      () => (mode === "suspend" ? listingApi.suspend(id, reason) : listingApi.reject(id, reason)),
      mode === "suspend"
        ? (lang === "bn" ? "তালিকা থেকে সরানো হয়েছে" : "Removed from the marketplace")
        : (lang === "bn" ? "আবেদন প্রত্যাখ্যাত" : "Application rejected"),
      "warning");
    if (ok) { setListingModal({ open: false, id: null, mode: null }); setListingReason(""); }
  };

  const toggleSuspend = async (type, id) => {
    // P1-11: this used to send is_active:-1 for both directions. The API
    // stored -1, and the auth middleware treats -1 as active — so the row
    // showed "suspended" while the account kept working. Send the real
    // target state, and only update the UI once the server confirms.
    const list = type === "provider" ? providers : users;
    const current = list.find(x => x.id === id);
    const nextActive = current?.status === "suspended" ? 1 : 0;
    try {
      await adminApi.updateUser(id, { is_active: nextActive });
      const nextStatus = nextActive ? "active" : "suspended";
      if (type==="provider") setProviders(p => p.map(x => x.id===id ? {...x, status:nextStatus} : x));
      else                   setUsers(p   => p.map(x => x.id===id ? {...x, status:nextStatus} : x));
      toast(lang==="bn" ? "✅ অবস্থা পরিবর্তিত" : "✅ Status updated");
    } catch(e) {
      toast((lang==="bn" ? "পরিবর্তন ব্যর্থ: " : "Update failed: ") + (e.data?.error || e.message), "error");
    }
  };
  /**
   * Open one case's evidence.
   *
   * Two audited steps, and the reason is required by the SERVER, not by a
   * check here — the kernel denies a document read that does not carry one
   * (R-1103, D-03). This asks the reviewer once and sends it with every
   * document, so the requirement is met deliberately rather than
   * discovered as a 422.
   *
   * Each URL is signed and lives five minutes. Nothing is cached, and the
   * URLs are dropped from state when the panel closes.
   */
  const loadKycImages = async (id, reason) => {
    const why = String(reason || "").trim();
    if (why.length < 4) {
      toast(lang === "bn"
        ? "কেন দেখছেন তা লিখুন — এটি রেকর্ড করা হবে।"
        : "Say why you are opening this — it is recorded.", "warning");
      return;
    }
    setKycList(k => k.map(x => x.id === id ? { ...x, docsLoading: true } : x));
    try {
      const c = await verificationApi.case(id);

      // A case migrated from the old table has its evidence in LONGTEXT
      // columns rather than object storage, so it comes back as base64.
      // That is the shape the old architecture left behind; it goes away
      // when the byte copy runs.
      let docs = [];
      if (c.documents?.length) {
        docs = await Promise.all(c.documents.map(async (d) => {
          const u = await verificationApi.documentUrl(d.documentId, why);
          return { kind: d.docType, src: u.url, expiresIn: u.expires_in };
        }));
      } else if (c.legacyEvidence) {
        const kinds = Object.entries(c.legacyEvidence.available)
          .filter(([, present]) => present).map(([kind]) => kind);
        docs = await Promise.all(kinds.map(async (kind) => {
          const r = await verificationApi.legacyImage(id, kind, why);
          const img = String(r.image || "");
          return { kind, src: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`, legacy: true };
        }));
      }

      setKycList(k => k.map(x => x.id === id
        ? { ...x, docs, docsLoading: false, caseState: c.state, availableTransitions: c.availableTransitions }
        : x));
      if (!docs.length) {
        toast(lang === "bn" ? "এই আবেদনে কোনো নথি নেই" : "This case has no documents", "warning");
      }
    } catch (e) {
      setKycList(k => k.map(x => x.id === id ? { ...x, docsLoading: false } : x));
      toast((lang === "bn" ? "নথি খোলা যায়নি: " : "Could not open the documents: ") + failure(e), "error");
    }
  };

  /**
   * The verification decisions.
   *
   * WHAT THESE USED TO DO
   * ─────────────────────
   *   setKycList(... status: "verified" ...);
   *   toast("✅ KYC Approved");
   *   adminApi.kycReview(id, "verified").catch(e => console.warn(...));
   *
   * The list was updated, the success toast was shown, and the request was
   * fired into a `console.warn`. An operator who was not permitted to
   * approve — or who hit a state conflict, or lost the network — saw
   * "✅ KYC Approved" and had approved nothing. The UI reported an outcome
   * it had not waited for and could not observe.
   *
   * Now every decision awaits the server, the list is refreshed from what
   * the server actually says, and a failure is shown to the person who
   * caused it. The reviewer is never told something happened unless it did.
   */
  const [kycBusy, setKycBusy] = useState(null);

  /** The message a failure should show. Never a raw exception. */
  const failure = (e) =>
    e?.data?.user_message?.[lang === "bn" ? "bn" : "en"] ||
    e?.data?.error || e?.message ||
    (lang === "bn" ? "কাজটি সম্পন্ন হয়নি।" : "That did not go through.");

  /**
   * Run one decision against the server and reflect ONLY what it returns.
   *
   * The case is claimed first where the machine requires it: there is no
   * `submitted → verified` edge, and the two steps are recorded separately
   * so the audit log can distinguish "reviewed it, then approved" from
   * "approved".
   */
  const decide = async (id, action, { reason, claimFirst = true } = {}) => {
    if (kycBusy) return;
    setKycBusy(id);
    try {
      if (claimFirst) {
        try { await verificationApi.claim(id); }
        catch (e) {
          // Already claimed by this or another reviewer — the only failure
          // worth continuing past.
          if (e?.data?.code !== "VERIFICATION_TRANSITION_INVALID") throw e;
        }
      }
      await action(id, reason);
      await loadKyc(kycFilter === "all" ? "submitted" : kycFilter);
      return true;
    } catch (e) {
      toast(failure(e), "error");
      return false;
    } finally {
      setKycBusy(null);
    }
  };

  const kycApprove = async (id) => {
    const ok = await decide(id, (i) => verificationApi.approve(i));
    if (ok) toast(lang === "bn" ? "✅ পরিচয় যাচাই সম্পন্ন" : "✅ Identity verified");
  };

  const kycReject = async () => {
    const reason = kycRejectReason.trim();
    // R-1103, said in the UI rather than discovered as a 422: a refusal a
    // person cannot answer is not a decision they can act on.
    if (reason.length < 10) {
      toast(lang === "bn"
        ? "কারণ লিখুন — অন্তত ১০ অক্ষর। আবেদনকারী এটাই দেখবেন।"
        : "Write a reason — at least 10 characters. The applicant sees exactly this.", "warning");
      return;
    }
    const id = kycRejectModal.id;
    const ok = await decide(id, (i, r) => verificationApi.reject(i, r), { reason });
    if (ok) {
      setKycRejectModal({ open: false, id: null });
      setKycRejectReason("");
      toast(lang === "bn" ? "প্রত্যাখ্যাত — আবেদনকারীকে কারণ জানানো হয়েছে" : "Rejected — the applicant has been told why", "warning");
    }
  };

  /** "Your photo is blurred, send another" — a request, not a refusal. */
  const kycRequestInfo = async () => {
    const reason = kycRejectReason.trim();
    if (reason.length < 10) {
      toast(lang === "bn"
        ? "কী দরকার তা লিখুন — অন্তত ১০ অক্ষর।"
        : "Say what is needed — at least 10 characters.", "warning");
      return;
    }
    const ok = await decide(kycRejectModal.id, (i, r) => verificationApi.requestInfo(i, r), { reason });
    if (ok) {
      setKycRejectModal({ open: false, id: null });
      setKycRejectReason("");
      toast(lang === "bn" ? "আবেদনকারীকে জানানো হয়েছে" : "The applicant has been asked", "info");
    }
  };

  /** verified → revoked. Takes standing away from a working provider. */
  const kycRevoke = async () => {
    const reason = kycRejectReason.trim();
    if (reason.length < 10) {
      toast(lang === "bn"
        ? "কারণ লিখুন — অন্তত ১০ অক্ষর।"
        : "Write a reason — at least 10 characters.", "warning");
      return;
    }
    const ok = await decide(kycRejectModal.id, (i, r) => verificationApi.revoke(i, r),
      { reason, claimFirst: false });
    if (ok) {
      setKycRejectModal({ open: false, id: null });
      setKycRejectReason("");
      toast(lang === "bn" ? "যাচাই বাতিল করা হয়েছে" : "Verification revoked", "warning");
    }
  };

  /* ── SIDEBAR MENU ──────────────────────────────────── */
  const kycPending  = kycList.filter(k => k.status === "submitted" || k.status === "under_review").length;
  const openTickets = tickets.filter(t => t.status==="open").length;
  const [sosAlerts, setSosAlerts] = useState([]);
  const [sosLoading, setSosLoading] = useState(false);

  const menuItems = [
    { key:"overview",      icon:<DashboardOutlined />,        label: lang==="bn"?"সারাংশ":"Overview"       },
    { key:"providers",     icon:<TeamOutlined />,              label: lang==="bn"?"প্রদানকারী":"Providers"  },
    { key:"users",         icon:<UserOutlined />,              label: lang==="bn"?"ব্যবহারকারী":"Users"     },
    { key:"bookings",      icon:<BookOutlined />,              label: lang==="bn"?"বুকিং":"Bookings"        },
    { key:"kyc",           icon:<SafetyCertificateOutlined />, label: <Badge count={kycPending} size="small" offset={[8,0]}>{lang==="bn"?"KYC যাচাই":"KYC"}</Badge> },
    { key:"revenue",       icon:<BarChartOutlined />,          label: lang==="bn"?"রাজস্ব":"Revenue"        },
    { key:"complaints",    icon:<WarningOutlined />,           label: <Badge count={openTickets} size="small" offset={[8,0]}>{lang==="bn"?"অভিযোগ":"Complaints"}</Badge> },
    { key:"sos",           icon:<span>🆘</span>,               label: <Badge count={sosAlerts?.filter(a=>a.status==="open").length||0} size="small" offset={[8,0]}>{lang==="bn"?"SOS সতর্কতা":"SOS Alerts"}</Badge> },
    { key:"payments",      icon:<span>💳</span>,               label: lang==="bn"?"পেমেন্ট":"Payments"         },
    { key:"notifications", icon:<NotificationOutlined />,      label: lang==="bn"?"বিজ্ঞপ্তি":"Notifications"},
    { key:"promos",        icon:<GiftOutlined />,              label: lang==="bn"?"প্রোমো কোড":"Promo Codes"},
    { key:"loans",         icon:<span>💹</span>,               label: lang==="bn"?"মাইক্রো-লোন":"Micro Loans"     },
    { key:"categories",    icon:<AppstoreOutlined />,          label: lang==="bn"?"সেবা বিভাগ":"Categories" },
    { key:"ai",            icon:<span>🤖</span>,               label: lang==="bn"?"AI Analytics":"AI Analytics" },
    { key:"settings",      icon:<SettingOutlined />,           label: lang==="bn"?"সেটিংস":"Settings"       },
  ];

  /* ── SOS STATE ───────────────────────────────────── */
  const loadSos = async () => {
    setSosLoading(true);
    try { const d = await sosApi?.list(); if(d?.alerts) setSosAlerts(d.alerts); }
    catch {}
    finally { setSosLoading(false); }
  };

  useEffect(() => { if(tab==="sos") loadSos(); }, [tab]);

  /* ── LOANS STATE ────────────────────────── */
  const [loanList,    setLoanList]    = useState([]);
  const [loanLoading, setLoanLoading] = useState(false);
  const [loanFilter,  setLoanFilter]  = useState("");

  const loadLoans = async (status = "") => {
    setLoanLoading(true);
    try { const d = await loansApi.adminList(status||undefined); if(d?.loans) setLoanList(d.loans); }
    catch {}
    finally { setLoanLoading(false); }
  };
  const updateLoan = async (id, status, note) => {
    try {
      await loansApi.update(id, status, note);
      setLoanList(prev => prev.map(l => l.id===id ? {...l, status} : l));
      toast(lang==="bn" ? "✅ লোন আপডেট হয়েছে" : "✅ Loan updated");
    } catch(e) { toast(e.data?.error||"Error", "error"); }
  };
  useEffect(() => { if(tab==="loans") loadLoans(loanFilter); }, [tab, loanFilter]);
  /* ── PAYMENTS STATE ─────────────────────── */
  const [payList,      setPayList]      = useState([]);
  const [payLoading,   setPayLoading]   = useState(false);
  const [payFilter,    setPayFilter]    = useState("");

  const loadPayments = async (status = "") => {
    setPayLoading(true);
    try { const d = await paymentsApi.adminList(status||undefined); if(d?.data) setPayList(d.data); }
    catch(e) { console.warn("payments load:", e.message); }
    finally { setPayLoading(false); }
  };

  useEffect(() => { if(tab==="payments") loadPayments(payFilter); }, [tab]);

  const exportRevenueCSV = () => {
    const data = monthlyRev2.length > 0 ? monthlyRev2 : monthlyRev;
    const rows = [["Month","Revenue (BDT)","Bookings"], ...data.map(r=>[r.m, Math.round(r.v), r.bookings||"—"])];
    const csv = rows.map(r=>r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`imap_revenue_${new Date().toISOString().slice(0,7)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printRevenueReport = () => {
    const data = monthlyRev2.length > 0 ? monthlyRev2 : monthlyRev;
    const now = new Date().toLocaleDateString("en-GB");
    const rows = data.map(r=>`<tr><td>${escHtml(r.m)}</td><td style='text-align:right;font-weight:700'>\u09F3${Math.round(r.v).toLocaleString()}</td></tr>`).join("");
    const topRows = topProviders.map((p,i)=>`<tr><td>#${i+1} ${escHtml(p.name)}</td><td>${escHtml(p.service)}</td><td style='text-align:right'>${parseInt(p.jobs)||0} jobs</td><td style='text-align:right;font-weight:700'>\u09F3${p.earned.toLocaleString()}</td></tr>`).join("");
    const w = window.open("","_blank","width=680,height=860");
    w.document.write(`<!DOCTYPE html><html><head><meta charset='UTF-8'><title>IMAP Revenue Report</title>`+
      `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;padding:24px}`+
      `.rpt{background:#fff;border-radius:12px;padding:32px;max-width:620px;margin:0 auto;border:1px solid #e2e8f0}`+
      `.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #f1f5f9}`+
      `.brand{font-size:22px;font-weight:900;color:#1e293b}.sub{font-size:12px;color:#64748b;margin-top:2px}`+
      `.rtitle{text-align:right;font-size:16px;font-weight:700;color:#006A4E}.rdate{font-size:11px;color:#64748b;margin-top:2px}`+
      `.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}`+
      `.stat{background:#f8fafc;border-radius:10px;padding:14px;text-align:center}.sv{font-size:20px;font-weight:900;color:#006A4E}.sl{font-size:11px;color:#64748b;margin-top:2px}`+
      `h3{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:10px;margin-top:20px}`+
      `table{width:100%;border-collapse:collapse;margin-bottom:8px;font-size:13px}`+
      `th{background:#f8fafc;padding:9px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;border-bottom:2px solid #e2e8f0}`+
      `td{padding:9px 12px;border-bottom:1px solid #f1f5f9}`+
      `.ft{text-align:center;font-size:10px;color:#94a3b8;margin-top:24px;padding-top:12px;border-top:1px solid #f1f5f9}`+
      `@media print{body{background:#fff;padding:0}.rpt{box-shadow:none}}</style></head>`+
      `<body onload='window.print()'><div class='rpt'>`+
      `<div class='hdr'><div><div class='brand'>\uD83C\uDFEF IMAP Bangladesh</div><div class='sub'>Admin Revenue Report</div></div>`+
      `<div><div class='rtitle'>\uD83D\uDCCA Revenue Report</div><div class='rdate'>Generated: ${now}</div></div></div>`+
      `<div class='stats'>`+
      `<div class='stat'><div class='sv'>\u09F3${Math.round(realStats?.revenue??0).toLocaleString()}</div><div class='sl'>Total Revenue</div></div>`+
      `<div class='stat'><div class='sv'>${realStats?.bookings??0}</div><div class='sl'>Total Bookings</div></div>`+
      `<div class='stat'><div class='sv'>${realStats?.providers??0}</div><div class='sl'>Active Providers</div></div>`+
      `</div>`+
      `<h3>\uD83D\uDCC5 Monthly Revenue</h3>`+
      `<table><thead><tr><th>Month</th><th style='text-align:right'>Revenue</th></tr></thead><tbody>${rows}</tbody></table>`+
      `<h3>\uD83C\uDFC6 Top Providers</h3>`+
      `<table><thead><tr><th>Provider</th><th>Service</th><th style='text-align:right'>Jobs</th><th style='text-align:right'>Earned</th></tr></thead><tbody>${topRows}</tbody></table>`+
      `<div class='ft'>IMAP Platform &middot; imap.com.bd &middot; Confidential</div>`+
      `</div></body></html>`);
    w.document.close();
  };

  /* ── PROVIDERS / USERS / BOOKINGS / KYC LIVE DATA ── */
  const [dataLoading, setDataLoading] = useState(false);

  const loadProviders = async (q = "") => {
    setDataLoading(true);
    try {
      const d = await adminApi.providers(q ? { q } : {});
      {
        setProviders((d.providers || []).map(p => ({
          id: p.user_id || p.id,
          _pid: p.id,
          name: p.name,
          service: p.service_slug || "—",
          area: p.area || "—",
          // The ACCOUNT's state and the LISTING's state are two different
          // questions. They were conflated: `status` was derived from
          // `is_active`, so the panel could not show whether a provider was
          // actually listable and "Approve" activated an account.
          accountActive: p.is_active === 1,
          listingState: p.listing_state || "applied",
          identityVerified: p.identity_verified === 1 || p.identity_verified === true,
          hourlyRate: p.hourly_rate === null || p.hourly_rate === undefined ? null : Number(p.hourly_rate),
          status: p.listing_state || "applied",
          rating: parseFloat(p.rating || 0).toFixed(1),
          jobs: p.total_jobs || 0,
          earned: parseFloat(p.earned || 0),
          nid: p.nid_verified ? "✓ Verified" : null,
          phone: p.phone,
          kyc: p.kyc_status,
        })));
      }
    } catch(e) { console.warn("load providers:", e.message); }
    finally { setDataLoading(false); }
  };

  const loadUsers = async (q = "") => {
    setDataLoading(true);
    try {
      const d = await adminApi.users(q ? { q, role: "customer" } : { role: "customer" });
      {
        setUsers((d.users || []).map(u => ({
          id: u.id,
          name: u.name,
          phone: u.phone,
          role: u.role,
          status: u.is_active ? "active" : "suspended",
          bookings: 0,
          joined: u.joined_at ? new Date(u.joined_at).toLocaleDateString("bn-BD") : "—",
          kyc: u.kyc_status,
        })));
      }
    } catch(e) { console.warn("load users:", e.message); }
    finally { setDataLoading(false); }
  };

  const loadBookings = async (status = "") => {
    setDataLoading(true);
    try {
      const d = await adminApi.bookings(status ? { status } : {});
      {
        setBookings((d.bookings || []).map(b => ({
          id: b.id?.toString().slice(0,8) || b.id,
          _rawId: b.id,
          customer: b.customer_name || b.customer_id,
          provider: b.provider_name || b.provider_id,
          service: b.service_name_en || b.service_name_bn || b.note || "—",
          status: b.status,
          amount: b.amount || 0,
          date: b.created_at ? new Date(b.created_at).toLocaleDateString("bn-BD") : "—",
        })));
      }
    } catch(e) { console.warn("load bookings:", e.message); }
    finally { setDataLoading(false); }
  };

  /**
   * The verification queue.
   *
   * `/api/verification/queue` rather than `/api/admin/kyc`: one queue over
   * `verification_case`, which is where the state machine lives. The old
   * endpoint reads the legacy `kyc_docs` table and only sees the backlog
   * that predates object storage.
   *
   * It carries NO document of any kind — not a URL, not a key, not a byte.
   * Evidence is opened one case at a time, with a stated reason, and each
   * open is recorded (V-07).
   */
  const loadKyc = async (state = "submitted") => {
    setDataLoading(true);
    try {
      const d = await verificationApi.queue(state);
      setKycList((d.cases || []).map(k => ({
        id: k.caseId,
        userName: k.subjectName || k.subjectId,
        phone: k.subjectPhone || "—",
        email: k.subjectEmail || null,
        submittedAt: k.submittedAt ? new Date(k.submittedAt).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB") : "—",
        waitingDays: k.submittedAt ? Math.floor((Date.now() - new Date(k.submittedAt)) / 86400000) : null,
        status: k.state,
        documentCount: k.documentCount || 0,
        legacy: !!k.legacy,
        docs: null,          // loaded on demand, with a reason
        docsLoading: false,
      })));
    } catch (e) {
      setKycList([]);
      toast((lang === "bn" ? "সারি লোড হয়নি: " : "Could not load the queue: ") + failure(e), "error");
    } finally { setDataLoading(false); }
  };

  const [bFilter, setBFilter] = useState("");

  const loadPromos = async () => {
    try {
      const data = await adminApi.promoList();
      if (Array.isArray(data) && data.length) {
        setPromos(data.map(p => ({
          id: p.id,
          code: p.code,
          discount: p.discount_pct > 0 ? p.discount_pct : (p.discount_amt || 0),
          type: p.discount_pct > 0 ? "percent" : "flat",
          uses: p.uses || 0,
          limit: p.limit || 999,
          expires: p.expires ? String(p.expires).slice(0, 10) : "—",
          active: !!p.active,
        })));
      }
    } catch(e) { console.warn("loadPromos:", e.message); }
  };

  const loadAnnouncements = async () => {
    try {
      const rows = await adminApi.announcements();
      if (Array.isArray(rows)) {
        setAnnouncements(rows.map(r => ({
          id: r.id,
          title: r.title_bn || r.title_en || "",
          msg:   r.body_bn  || r.body_en  || "",
          target: "all",
          date: new Date(r.created_at).toLocaleDateString(),
          reach: r.reach || 0,
        })));
      }
    } catch(e) { console.warn("loadAnnouncements:", e.message); }
  };

  const loadCategories = async () => {
    try {
      const data = await servicesApi.list(true);
      if (Array.isArray(data) && data.length) {
        setCategories(data.map(c => ({
          id: c.id,
          icon: c.icon || "🔧",
          name: c.name_bn || c.name_en || c.name || "Service",
          providers: c.available_count || 0,
          active: c.is_active !== 0,
        })));
      }
    } catch(e) { console.warn("loadCategories:", e.message); }
  };

  const loadTickets = async (status = "") => {
    try {
      const list = await adminApi.complaints(status ? { status } : {});
      if (Array.isArray(list) && list.length) {
        setTickets(list.map(c => ({
          id: `DSP-${c.id}`,
          _rawId: c.id,
          customer: c.user_name || c.user_id || "—",
          provider: c.booking_id ? `BK-${c.booking_id}` : "—",
          issue: c.subject || c.description || "অভিযোগ",
          status: c.status === "resolved" || c.status === "closed" ? c.status : "open",
          date: c.created_at ? c.created_at.slice(0, 10) : "—",
          priority: c.priority || "medium",
        })));
      }
    } catch(e) { console.warn("load tickets:", e.message); }
  };

  useEffect(() => {
    if (tab === "overview")           { loadProviders(); loadBookings(); }
    else if (tab === "providers")     loadProviders(pSearch);
    else if (tab === "users")         loadUsers(uSearch);
    else if (tab === "bookings")      loadBookings(bFilter);
    else if (tab === "kyc")           loadKyc(kycFilter === "all" ? "submitted" : kycFilter);
    else if (tab === "promos")        loadPromos();
    else if (tab === "categories")    loadCategories();
    else if (tab === "notifications") loadAnnouncements();
    else if (tab === "complaints")    loadTickets(ticketFilter === "all" ? "" : ticketFilter);
    else if (tab === "settings") {
      adminApi.loadSettings().then(rows => {
        if (Array.isArray(rows) && rows.length === 6) {
          setSysToggles(rows.map(r => !!r.val));
        }
      }).catch(() => {});
    }
  }, [tab]);

  /* ── AI STATE ─────────────────────────────────────── */
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiForecast, setAiForecast] = useState(null);
  const [aiChurn, setAiChurn]       = useState(null);
  const [aiHeatmap, setAiHeatmap]   = useState(null);

  const loadAiData = async () => {
    setAiLoading(true);
    try {
      const [fc, ch, hm] = await Promise.all([
        aiApi.forecast().catch(()=>null),
        aiApi.churn().catch(()=>null),
        aiApi.heatmap().catch(()=>null),
      ]);
      if(fc) setAiForecast(fc);
      if(ch) setAiChurn(ch);
      if(hm) setAiHeatmap(hm);
    } catch(e) { console.warn("AI load error", e.message); }
    finally { setAiLoading(false); }
  };

  useEffect(() => { if(tab==="ai") loadAiData(); }, [tab]);

  /* ── TABLE COLUMNS ─────────────────────────────────── */
  /**
   * The provider queue.
   *
   * `TRUST-ARCHITECTURE.md` §5 makes listing a conjunction, so the table
   * shows the two clauses an operator can act on — the human approval and
   * the identity verification — rather than one status that answered
   * neither. A provider who is approved but unverified is still not listed,
   * and before this the panel had no way to say so.
   */
  const providerCols = [
    { title:lang==="bn"?"নাম":"Name",    dataIndex:"name",    key:"name",    render:n=><Text strong>{n}</Text> },
    { title:lang==="bn"?"সেবা":"Service", dataIndex:"service", key:"service" },
    { title:lang==="bn"?"এলাকা":"Area",   dataIndex:"area",    key:"area"    },
    { title:lang==="bn"?"রেটিং":"Rating", dataIndex:"rating",  key:"rating",  render:v=><Text style={{color:"#F59E0B"}}>⭐ {v}</Text> },
    { title:lang==="bn"?"কাজ":"Jobs",     dataIndex:"jobs",    key:"jobs"    },
    {
      title: lang==="bn"?"পরিচয়":"Identity", key:"identity",
      render: (_,p) => p.identityVerified
        ? <Tag color="success">{lang==="bn"?"✅ যাচাইকৃত":"✅ Verified"}</Tag>
        : <Tag color="warning">{lang==="bn"?"অযাচাইকৃত":"Not verified"}</Tag>,
    },
    {
      title: lang==="bn"?"তালিকা":"Listing", dataIndex:"listingState", key:"listingState",
      render: s => <StatusTag status={s} lang={lang}/>,
    },
    {
      // Whether they are ACTUALLY visible to customers, which is the
      // conjunction rather than any single column.
      title: lang==="bn"?"দৃশ্যমান":"Live", key:"live",
      render: (_,p) => {
        const live = p.listingState === "approved" && p.identityVerified && p.accountActive && p.hourlyRate > 0;
        return live
          ? <Tag color="success">{lang==="bn"?"হ্যাঁ":"Yes"}</Tag>
          : <Tag color="default">{lang==="bn"?"না":"No"}</Tag>;
      },
    },
    { title:lang==="bn"?"অ্যাকশন":"Action", key:"action", render:(_,p)=>(
      <Space wrap>
        {p.listingState !== "approved" && (
          <Button size="small" type="primary" loading={listingBusy===p._pid}
            // TRUST §6: identity verification is what grants listing
            // eligibility, so approving without it is refused by the server.
            // Saying so here beats letting the operator find out as a 409.
            disabled={!p.identityVerified}
            title={!p.identityVerified
              ? (lang==="bn"?"আগে পরিচয় যাচাই প্রয়োজন":"Identity must be verified first")
              : undefined}
            onClick={()=>approveProvider(p)}>
            {lang==="bn"?"তালিকাভুক্ত":"List"}
          </Button>
        )}
        {p.listingState === "applied" && (
          <Button size="small" danger disabled={listingBusy===p._pid}
            onClick={()=>{setListingModal({open:true,id:p._pid,mode:"reject"});setListingReason("");}}>
            {lang==="bn"?"প্রত্যাখ্যান":"Reject"}
          </Button>
        )}
        {p.listingState === "approved" && (
          <Button size="small" danger ghost disabled={listingBusy===p._pid}
            onClick={()=>{setListingModal({open:true,id:p._pid,mode:"suspend"});setListingReason("");}}>
            {lang==="bn"?"স্থগিত":"Suspend"}
          </Button>
        )}
        <Button size="small" onClick={()=>toggleSuspend("provider",p.id)}>
          {/* The ACCOUNT, which is a different thing from the listing. */}
          {p.accountActive?(lang==="bn"?"অ্যাকাউন্ট বন্ধ":"Disable account"):(lang==="bn"?"অ্যাকাউন্ট চালু":"Enable account")}
        </Button>
      </Space>
    )},
  ];

  const userCols = [
    { title:lang==="bn"?"নাম":"Name",       dataIndex:"name",     key:"name",     render:n=><Text strong>{n}</Text> },
    { title:lang==="bn"?"ফোন":"Phone",      dataIndex:"phone",    key:"phone"    },
    { title:lang==="bn"?"ভূমিকা":"Role",    dataIndex:"role",     key:"role",     render:r=><Tag color="blue">{r}</Tag> },
    { title:lang==="bn"?"বুকিং":"Bookings", dataIndex:"bookings", key:"bookings" },
    { title:lang==="bn"?"যোগদান":"Joined",  dataIndex:"joined",   key:"joined"   },
    { title:lang==="bn"?"অবস্থা":"Status",  dataIndex:"status",   key:"status",   render:s=><StatusTag status={s} lang={lang}/> },
    { title:lang==="bn"?"অ্যাকশন":"Action", key:"action", render:(_,u)=>(
      <Button size="small" danger={u.status!=="suspended"} onClick={()=>toggleSuspend("user",u.id)}>
        {u.status==="suspended"?(lang==="bn"?"সক্রিয়":"Activate"):(lang==="bn"?"বন্ধ":"Suspend")}
      </Button>
    )},
  ];

  const bookingCols = [
    { title:"ID",      dataIndex:"id",       key:"id",       render:v=><Text code>{v}</Text> },
    { title:lang==="bn"?"গ্রাহক":"Customer",     dataIndex:"customer",  key:"customer"  },
    { title:lang==="bn"?"প্রদানকারী":"Provider", dataIndex:"provider",  key:"provider"  },
    { title:lang==="bn"?"সেবা":"Service",         dataIndex:"service",   key:"service"   },
    { title:lang==="bn"?"অবস্থা":"Status",        dataIndex:"status",    key:"status",   render:s=><StatusTag status={s} lang={lang}/> },
    { title:lang==="bn"?"পরিমাণ":"Amount",         dataIndex:"amount",    key:"amount",   render:v=>v>0?<Text strong style={{color:"#00C170"}}>৳{v}</Text>:"—" },
    { title:lang==="bn"?"তারিখ":"Date",            dataIndex:"date",      key:"date"      },
  ];

  const filtP = providers.filter(p => !pSearch||(p.name||'').includes(pSearch)||(p.service||'').includes(pSearch)||(p.area||'').includes(pSearch));
  const filtU = users.filter(u => !uSearch||(u.name||'').includes(uSearch)||(u.phone||'').includes(uSearch));
  const displayBookings = bookings;
  const filtB = displayBookings.filter(b => !bSearch||(b.id||'').includes(bSearch)||(b.customer||'').includes(bSearch)||(b.provider||'').includes(bSearch));

  const monthlyRev = [
    {m:"জান",v:28400},{m:"ফেব",v:32100},{m:"মার্চ",v:41500},
    {m:"এপ্রিল",v:38900},{m:"মে",v:52300},{m:"জুন",v:47800},
  ];
  const maxRev = Math.max(...monthlyRev.map(x=>x.v));

  const topProviders = [...providers]
    .sort((a,b) => (b.jobs||0) - (a.jobs||0))
    .slice(0, 3)
    .map(p => ({ name:p.name, jobs:p.jobs||0, earned:p.earned||0, service:p.service||"—" }));

  const sysSettingsList = [
    {icon:"🌐",lbn:"সিস্টেম অনলাইন",      len:"System Online"},
    {icon:"🔧",lbn:"রক্ষণাবেক্ষণ মোড",    len:"Maintenance Mode"},
    {icon:"📲",lbn:"SMS নোটিফিকেশন",      len:"SMS Notifications"},
    {icon:"🤖",lbn:"AI ম্যাচিং",           len:"AI Matching"},
    {icon:"💳",lbn:"পেমেন্ট গেটওয়ে",      len:"Payment Gateway"},
    {icon:"🛡️",lbn:"NID যাচাই প্রয়োজনীয়", len:"NID Verification Required"},
  ];

  /* ── RENDER ──────────────────────────────────────── */
  return (
    <ConfigProvider theme={{
      algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      token: {
        colorPrimary: "#006A4E",
        borderRadius: 10,
        fontFamily: "'Hind Siliguri','Noto Sans Bengali',sans-serif",
      },
    }}>
      {ctx}
      <Layout style={{minHeight:"100vh"}}>

        {/* SIDEBAR */}
        {!isMobile && (
          <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}
            style={{overflow:"auto", height:"100vh", position:"sticky", top:0}}
            width={220} theme={dark?"dark":"light"}>
            <div style={{padding:collapsed?"16px 8px":"16px 20px", marginBottom:8}}>
              <Space>
                <span style={{fontSize:22}}>🌿</span>
                {!collapsed && <Text strong style={{color:"#006A4E",fontSize:15}}>IMAP Admin</Text>}
              </Space>
            </div>
            <Menu mode="inline" selectedKeys={[tab]} onClick={({key})=>setTab(key)}
              items={menuItems} style={{border:"none"}} theme={dark?"dark":"light"} />
          </Sider>
        )}

        <Layout>
          {/* HEADER */}
          <Header style={{
            padding:"0 20px", display:"flex", alignItems:"center",
            justifyContent:"space-between", position:"sticky", top:0, zIndex:100,
            background:dark?"rgba(8,15,11,.9)":"rgba(255,255,255,.9)",
            backdropFilter:"blur(6px) saturate(130%)",
            WebkitBackdropFilter:"blur(6px) saturate(130%)",
            borderBottom:dark?"1px solid rgba(30,69,53,.5)":"1px solid rgba(255,255,255,.6)",
            boxShadow:dark
              ?"0 2px 20px rgba(0,0,0,.3),inset 0 -1px 0 rgba(5,150,105,.06)"
              :"0 2px 16px rgba(5,150,105,.06),inset 0 -1px 0 rgba(255,255,255,.8)",
            height:56,
          }}>
            <Space>
              {!isMobile && (
                <Button type="text" onClick={()=>setCollapsed(!collapsed)}
                  icon={collapsed?<MenuUnfoldOutlined/>:<MenuFoldOutlined/>} />
              )}
              {isMobile && <><span style={{fontSize:20}}>🌿</span><Text strong style={{color:"#006A4E"}}>IMAP Admin</Text></>}
            </Space>
            <Space size={8}>
              <Button size="small" onClick={()=>setLang(lang==="bn"?"en":"bn")}>{lang==="bn"?"EN":"বাং"}</Button>
              <Button size="small" icon={dark?<SunOutlined/>:<MoonOutlined/>} onClick={()=>setDark(!dark)} />
              <Avatar style={{background:"#006A4E"}}>{user?.name?.[0]||"A"}</Avatar>
              <Text strong style={{fontSize:13}}>{user?.name}</Text>
              <Button danger size="small" icon={<LogoutOutlined/>} onClick={onLogout}>
                {lang==="bn"?"বের":"Logout"}
              </Button>
            </Space>
          </Header>

          {/* Mobile tab scroll */}
          {isMobile && (
            <div style={{
              display:"flex",overflowX:"auto",
              background:dark?"rgba(8,15,11,.9)":"rgba(255,255,255,.9)",
              backdropFilter:"blur(3px)",WebkitBackdropFilter:"blur(3px)",
              borderBottom:`1px solid ${dark?"rgba(30,69,53,.4)":"rgba(0,0,0,0.06)"}`,
              scrollbarWidth:"none",
              boxShadow:dark?"0 2px 12px rgba(0,0,0,.2)":"0 2px 8px rgba(0,0,0,.04)"
            }}>
              {menuItems.map(item=>(
                <button key={item.key} onClick={()=>setTab(item.key)} style={{
                  flex:"0 0 auto",padding:"10px 14px",border:"none",
                  borderBottom:`2.5px solid ${tab===item.key?"#006A4E":"transparent"}`,
                  background:"transparent", color:tab===item.key?"#006A4E":"#888",
                  fontWeight:tab===item.key?700:500, fontSize:12, cursor:"pointer",
                  fontFamily:"inherit", whiteSpace:"nowrap",
                }}>
                  {item.icon}
                </button>
              ))}
            </div>
          )}

          {/* CONTENT */}
          <Content style={{padding:isMobile?16:24, overflow:"auto"}}>

            {/* ── OVERVIEW ── */}
            {tab==="overview" && (
              <>
                <Title level={4} style={{marginBottom:20}}>📊 {lang==="bn"?"সারাংশ":"Overview"}</Title>
                <Row gutter={[16,16]} style={{marginBottom:24}}>
                  {[
                    {title:lang==="bn"?"মোট ব্যবহারকারী":"Total Users",  value:realStats?.users??users.length+providers.length, color:"#3B82F6"},
                    {title:lang==="bn"?"প্রদানকারী":"Providers",           value:realStats?.providers??providers.length,              color:"#006A4E"},
                    {title:lang==="bn"?"মোট বুকিং":"Total Bookings",      value:realStats?.bookings??bookings.length,               color:"#F59E0B"},
                    {title:lang==="bn"?"KYC অপেক্ষায়":"KYC Pending",      value:realStats?.kycPending??providers.filter(p=>p.status==="pending").length, color:"#EF4444"},
                    {title:lang==="bn"?"চলমান বুকিং":"Today's Bookings",  value:realStats?.todayBookings??bookings.filter(b=>b.status==="ongoing").length, color:"#8B5CF6"},
                    {title:lang==="bn"?"মোট রাজস্ব":"Total Revenue",       value:`৳${Math.round(realStats?.revenue??3100).toLocaleString()}`, color:"#00C170"},
                  ].map((s,i)=>(
                    <Col xs={12} sm={8} lg={4} key={i}>
                      <Card bordered bodyStyle={{padding:16}} style={{borderTop:`3px solid ${s.color}`}}>
                        <Statistic value={s.value} valueStyle={{fontSize:18,color:s.color,fontWeight:800}} />
                        <Text type="secondary" style={{fontSize:11}}>{s.title}</Text>
                      </Card>
                    </Col>
                  ))}
                </Row>
                {/* SVG Revenue + Bookings Chart */}
                {monthlyRev2.length>0&&(
                  <Card title={`📈 ${lang==="bn"?"মাসিক রাজস্ব (৳)":"Monthly Revenue (৳)"}`} bordered style={{marginBottom:20}}>
                    <div style={{overflowX:"auto"}}>
                      <svg width={Math.max(500,monthlyRev2.length*80)} height={160} style={{display:"block"}}>
                        {(()=>{
                          const maxV=Math.max(...monthlyRev2.map(m=>m.v),1);
                          const bw=60, gap=20, padL=40, padT=10, chartH=120;
                          return monthlyRev2.map((m,i)=>{
                            const h=Math.round((m.v/maxV)*chartH)||4;
                            const x=padL+i*(bw+gap);
                            const y=padT+chartH-h;
                            return (
                              <g key={i}>
                                <rect x={x} y={y} width={bw} height={h} rx={4} fill={`hsl(${160+i*15},70%,45%)`} opacity={0.88}/>
                                <text x={x+bw/2} y={y-4} textAnchor="middle" fontSize={10} fill="#555">৳{m.v>=1000?(m.v/1000).toFixed(1)+"k":m.v}</text>
                                <text x={x+bw/2} y={padT+chartH+14} textAnchor="middle" fontSize={10} fill="#888">{m.m}</text>
                                <text x={x+bw/2} y={padT+chartH+26} textAnchor="middle" fontSize={9} fill="#aaa">{m.b} bk</text>
                              </g>
                            );
                          });
                        })()}
                      </svg>
                    </div>
                  </Card>
                )}
                <Row gutter={[16,16]}>
                  <Col xs={24} lg={14}>
                    <Card title={lang==="bn"?"🕐 সাম্প্রতিক বুকিং":"🕐 Recent Bookings"} bordered>
                      <Table dataSource={displayBookings.slice(0,3)} columns={bookingCols.slice(0,5)}
                        pagination={false} size="small" rowKey="id" />
                    </Card>
                  </Col>
                  <Col xs={24} lg={10}>
                    <Card title={lang==="bn"?"⏳ অনুমোদন অপেক্ষামাণ":"⏳ Pending Approvals"} bordered>
                      {/* `status` used to be derived from `is_active`, and
                          "pending" meant is_active was neither 0 nor 1 —
                          which essentially never happened, so this list was
                          almost always empty regardless of how many people
                          were actually waiting. It reads the listing state
                          now, which is the thing being approved. */}
                      {providers.filter(p=>p.listingState==="applied").map(p=>(
                        <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
                          <div>
                            <Text strong>{p.name}</Text><br/>
                            <Text type="secondary" style={{fontSize:12}}>{p.service} · {p.area}</Text>
                            {!p.identityVerified && (
                              <><br/><Text type="warning" style={{fontSize:11}}>
                                {lang==="bn"?"পরিচয় যাচাই বাকি":"identity not verified yet"}
                              </Text></>
                            )}
                          </div>
                          <Space>
                            <Button size="small" type="primary" icon={<CheckOutlined/>}
                              loading={listingBusy===p._pid}
                              disabled={!p.identityVerified}
                              onClick={()=>approveProvider(p)} />
                            <Button size="small" danger icon={<CloseOutlined/>}
                              disabled={listingBusy===p._pid}
                              onClick={()=>{setListingModal({open:true,id:p._pid,mode:"reject"});setListingReason("");}} />
                          </Space>
                        </div>
                      ))}
                      {providers.filter(p=>p.listingState==="applied").length===0 && (
                        <Text type="secondary" style={{fontSize:13}}>
                          {lang==="bn"?"কোনো আবেদন অপেক্ষমাণ নেই।":"No applications waiting."}
                        </Text>
                      )}
                      {providers.filter(p=>p.status==="pending").length===0 &&
                        <Text type="secondary">{lang==="bn"?"কোনো অপেক্ষমাণ নেই":"None pending"}</Text>}
                    </Card>
                  </Col>
                </Row>
              </>
            )}

            {/* ── PROVIDERS ── */}
            {tab==="providers" && (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <Title level={4} style={{margin:0}}>👷 {lang==="bn"?"প্রদানকারী":"Providers"}</Title>
                  <Input prefix={<SearchOutlined/>} value={pSearch}
                    onChange={e=>{setPSearch(e.target.value); loadProviders(e.target.value);}}
                    placeholder={tr.adSearch||"Search..."} style={{width:240}} allowClear />
                </div>
                <Table dataSource={filtP} columns={providerCols} rowKey="id" bordered size="middle"
                  loading={dataLoading} scroll={{x:1100}} pagination={{pageSize:10}} />
                <Modal
                  title={listingModal.mode==="suspend"
                    ? (lang==="bn"?"তালিকা থেকে সরানোর কারণ":"Why remove this provider?")
                    : (lang==="bn"?"প্রত্যাখ্যানের কারণ":"Why reject this application?")}
                  open={listingModal.open}
                  confirmLoading={!!listingBusy}
                  onOk={submitListingDecision}
                  onCancel={()=>setListingModal({open:false,id:null,mode:null})}
                  okText={lang==="bn"?"নিশ্চিত":"Confirm"} okButtonProps={{danger:true}}>
                  <Paragraph type="secondary" style={{fontSize:13}}>
                    {listingModal.mode==="suspend"
                      ? (lang==="bn"
                          ? "প্রদানকারী তৎক্ষণাৎ মার্কেটপ্লেস থেকে সরে যাবেন। কারণটি রেকর্ড হবে।"
                          : "The provider disappears from the marketplace immediately. The reason is recorded.")
                      : (lang==="bn"
                          ? "আবেদনকারী এই কারণটি দেখবেন এবং সংশোধন করে আবার আবেদন করতে পারবেন।"
                          : "The applicant sees this reason and can correct it and apply again.")}
                  </Paragraph>
                  <Input.TextArea rows={3} value={listingReason} maxLength={500} showCount
                    onChange={e=>setListingReason(e.target.value)}
                    placeholder={lang==="bn"
                      ? "যেমন: সেবার বিবরণ অসম্পূর্ণ এবং এলাকা উল্লেখ নেই।"
                      : "e.g. The service description is incomplete and no area is given."} />
                </Modal>
              </>
            )}

            {/* ── USERS ── */}
            {tab==="users" && (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <Title level={4} style={{margin:0}}>👥 {lang==="bn"?"ব্যবহারকারী":"Users"}</Title>
                  <Input prefix={<SearchOutlined/>} value={uSearch}
                    onChange={e=>{setUSearch(e.target.value); loadUsers(e.target.value);}}
                    placeholder={tr.adSearch||"Search..."} style={{width:240}} allowClear />
                </div>
                <Table dataSource={filtU} columns={userCols} rowKey="id" bordered size="middle"
                  loading={dataLoading} scroll={{x:800}} pagination={{pageSize:10}} />
              </>
            )}

            {/* ── BOOKINGS ── */}
            {tab==="bookings" && (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <Title level={4} style={{margin:0}}>📋 {lang==="bn"?"বুকিং":"Bookings"}</Title>
                  <Space>
                    <Select value={bFilter} onChange={v=>{setBFilter(v); loadBookings(v);}}
                      style={{width:150}} size="middle"
                      options={[
                        {value:"",    label:lang==="bn"?"সব স্ট্যাটাস":"All Status"},
                        {value:"pending",   label:"Pending"},
                        {value:"confirmed", label:"Confirmed"},
                        {value:"ongoing",   label:"Ongoing"},
                        {value:"completed", label:"Completed"},
                        {value:"cancelled", label:"Cancelled"},
                      ]}
                    />
                    <Input prefix={<SearchOutlined/>} value={bSearch} onChange={e=>setBSearch(e.target.value)}
                      placeholder={tr.adSearch||"Search..."} style={{width:200}} allowClear />
                  </Space>
                </div>
                <Table dataSource={filtB} columns={bookingCols} rowKey="id" bordered size="middle" scroll={{x:900}}
                  loading={dataLoading} pagination={{pageSize:10}}
                  summary={()=>(
                    <Table.Summary.Row>
                      <Table.Summary.Cell colSpan={5}><Text strong>{lang==="bn"?"মোট রাজস্ব":"Total Revenue"}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell><Text strong style={{color:"#00C170"}}>৳{displayBookings.reduce((a,b)=>a+(b.amount||0),0).toLocaleString()}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell/>
                    </Table.Summary.Row>
                  )}
                />
              </>
            )}

            {/* ── VERIFICATION ── */}
            {tab==="kyc" && (
              <>
                <Title level={4} style={{marginBottom:4}}>🪪 {lang==="bn"?"পরিচয় যাচাই":"Identity verification"}</Title>
                <Paragraph type="secondary" style={{fontSize:13,marginBottom:16,maxWidth:640}}>
                  {lang==="bn"
                    ? "একটি নথি খোলা রেকর্ড করা হয় — কে খুলেছেন, কখন, এবং কেন। সিদ্ধান্ত মানুষই নেন; কোনো স্বয়ংক্রিয় অনুমোদন নেই।"
                    : "Opening a document is recorded — who opened it, when, and why. Every decision is made by a person; nothing here approves anybody automatically."}
                </Paragraph>

                <Space style={{marginBottom:16}} wrap>
                  {[
                    {v:"submitted",    l:lang==="bn"?"অপেক্ষায়":"Waiting"},
                    {v:"under_review", l:lang==="bn"?"পর্যালোচনায়":"In review"},
                    {v:"more_info",    l:lang==="bn"?"তথ্য চাওয়া হয়েছে":"Info requested"},
                    {v:"verified",     l:lang==="bn"?"যাচাইকৃত":"Verified"},
                    {v:"rejected",     l:lang==="bn"?"প্রত্যাখ্যাত":"Rejected"},
                  ].map(f=>(
                    <Button key={f.v} type={kycFilter===f.v?"primary":"default"} size="small"
                      onClick={()=>{setKycFilter(f.v); loadKyc(f.v);}}>{f.l}</Button>
                  ))}
                  <Button size="small" onClick={()=>loadKyc(kycFilter==="all"?"submitted":kycFilter)} loading={dataLoading}>
                    {lang==="bn"?"রিফ্রেশ":"Refresh"}
                  </Button>
                </Space>

                {/* An empty queue is a fact, and it is stated. The list used to
                    be seeded with five invented applicants, so "nothing here"
                    was never something an operator could see. */}
                {!dataLoading && kycList.length===0 && (
                  <Card bordered style={{textAlign:"center",padding:"32px 16px"}}>
                    <div style={{fontSize:40,marginBottom:8}}>✅</div>
                    <Text strong style={{display:"block",marginBottom:4}}>
                      {lang==="bn"?"এই তালিকায় কিছু নেই":"Nothing in this list"}
                    </Text>
                    <Text type="secondary" style={{fontSize:13}}>
                      {lang==="bn"?"কেউ অপেক্ষা করছেন না।":"Nobody is waiting."}
                    </Text>
                  </Card>
                )}

                <Row gutter={[12,12]}>
                  {kycList.map(kyc=>{
                    const tone = kyc.status==="verified" ? "#00C170"
                      : kyc.status==="rejected" ? "#EF4444"
                      : kyc.status==="more_info" ? "#3B82F6" : "#F59E0B";
                    const decidable = kyc.status==="submitted" || kyc.status==="under_review";
                    // How long somebody has been waiting is the number an
                    // operations team actually manages, so it is on the card
                    // rather than derivable from a date.
                    const waited = kyc.waitingDays;
                    return (
                      <Col xs={24} lg={12} key={kyc.id}>
                        <Card bordered style={{borderLeft:`4px solid ${tone}`}} bodyStyle={{padding:16}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                            <div>
                              <Text strong style={{fontSize:15}}>{kyc.userName}</Text>
                              {kyc.legacy && <Tag style={{marginLeft:6}}>{lang==="bn"?"পুরোনো":"legacy"}</Tag>}
                              <br/>
                              <Text type="secondary" style={{fontSize:12}}>{kyc.phone}</Text>
                              {kyc.email && <><br/><Text type="secondary" style={{fontSize:12}}>{kyc.email}</Text></>}
                              <br/>
                              <Text type="secondary" style={{fontSize:11}}>
                                {kyc.submittedAt}
                                {waited!=null && waited>0 && ` · ${waited} ${lang==="bn"?"দিন অপেক্ষায়":(waited===1?"day waiting":"days waiting")}`}
                                {` · ${kyc.documentCount} ${lang==="bn"?"নথি":(kyc.documentCount===1?"document":"documents")}`}
                              </Text>
                            </div>
                            <StatusTag status={kyc.status} lang={lang}/>
                          </div>

                          {/* Opening evidence needs a stated reason. It is asked
                              for here, once, because the server refuses a read
                              that does not carry one. */}
                          {!kyc.docs && (
                            <div style={{marginTop:12}}>
                              <Input.Search
                                size="small"
                                allowClear
                                enterButton={kyc.docsLoading
                                  ? (lang==="bn"?"খোলা হচ্ছে…":"Opening…")
                                  : (lang==="bn"?"নথি খুলুন":"Open documents")}
                                loading={!!kyc.docsLoading}
                                placeholder={lang==="bn"?"কেন দেখছেন? (রেকর্ড হবে)":"Why are you opening this? (recorded)"}
                                onSearch={(v)=>loadKycImages(kyc.id, v)}
                              />
                            </div>
                          )}

                          {kyc.docs && kyc.docs.length>0 && (
                            <>
                              <Row gutter={8} style={{marginTop:12}}>
                                {kyc.docs.map((d,i)=>(
                                  <Col span={8} key={i}>
                                    <Card bodyStyle={{padding:8,textAlign:"center"}} size="small">
                                      <img src={d.src} alt={d.kind}
                                        style={{width:"100%",height:78,objectFit:"cover",borderRadius:6,cursor:"zoom-in"}}
                                        onClick={()=>window.open(d.src,"_blank","noopener,noreferrer")}/>
                                      <Text type="secondary" style={{fontSize:10}}>
                                        {({id_front:lang==="bn"?"সামনে":"Front",
                                           id_back:lang==="bn"?"পেছনে":"Back",
                                           selfie:lang==="bn"?"সেলফি":"Selfie",
                                           certificate:lang==="bn"?"সনদ":"Certificate"})[d.kind] || d.kind}
                                      </Text>
                                    </Card>
                                  </Col>
                                ))}
                              </Row>
                              {/* The link is a five-minute capability, not a
                                  location. Saying so stops a reviewer pasting
                                  it somewhere and wondering why it died. */}
                              <Text type="secondary" style={{fontSize:11,display:"block",marginTop:6}}>
                                {lang==="bn"
                                  ? "🔒 লিঙ্কগুলো ৫ মিনিট পরে কাজ করবে না। শেয়ার করবেন না।"
                                  : "🔒 These links stop working in five minutes. Do not share them."}
                              </Text>
                            </>
                          )}

                          {decidable && (
                            <Space style={{marginTop:14}} wrap>
                              <Button size="small" type="primary" icon={<CheckOutlined/>}
                                loading={kycBusy===kyc.id}
                                disabled={!kyc.docs}
                                onClick={()=>kycApprove(kyc.id)}>
                                {lang==="bn"?"যাচাই সম্পন্ন":"Verify"}
                              </Button>
                              <Button size="small" danger icon={<CloseOutlined/>}
                                disabled={kycBusy===kyc.id}
                                onClick={()=>{setKycRejectModal({open:true,id:kyc.id,mode:"reject"});setKycRejectReason("");}}>
                                {lang==="bn"?"প্রত্যাখ্যান":"Reject"}
                              </Button>
                              <Button size="small"
                                disabled={kycBusy===kyc.id}
                                onClick={()=>{setKycRejectModal({open:true,id:kyc.id,mode:"info"});setKycRejectReason("");}}>
                                {lang==="bn"?"আরও তথ্য চান":"Ask for more"}
                              </Button>
                            </Space>
                          )}
                          {decidable && !kyc.docs && (
                            <Text type="secondary" style={{fontSize:11,display:"block",marginTop:6}}>
                              {lang==="bn"
                                ? "নথি না দেখে অনুমোদন করা যাবে না।"
                                : "You cannot verify somebody without looking at their documents."}
                            </Text>
                          )}

                          {kyc.status==="verified" && (
                            <Button size="small" danger ghost style={{marginTop:12}}
                              disabled={kycBusy===kyc.id}
                              onClick={()=>{setKycRejectModal({open:true,id:kyc.id,mode:"revoke"});setKycRejectReason("");}}>
                              {lang==="bn"?"যাচাই বাতিল":"Revoke verification"}
                            </Button>
                          )}
                        </Card>
                      </Col>
                    );
                  })}
                </Row>

                {/* One modal for the three decisions that need a reason. The
                    reason is what the applicant is shown, so the copy says so
                    — a reviewer typing "no" should know who reads it. */}
                <Modal
                  title={kycRejectModal.mode==="info"
                    ? (lang==="bn"?"কী দরকার তা লিখুন":"What do you need?")
                    : kycRejectModal.mode==="revoke"
                    ? (lang==="bn"?"যাচাই বাতিলের কারণ":"Why revoke this verification?")
                    : (lang==="bn"?"প্রত্যাখ্যানের কারণ":"Why are you rejecting this?")}
                  open={kycRejectModal.open}
                  confirmLoading={!!kycBusy}
                  onOk={kycRejectModal.mode==="info" ? kycRequestInfo
                       : kycRejectModal.mode==="revoke" ? kycRevoke : kycReject}
                  onCancel={()=>setKycRejectModal({open:false,id:null})}
                  okText={lang==="bn"?"পাঠান":"Send"}
                  okButtonProps={{danger:kycRejectModal.mode!=="info"}}>
                  <Paragraph type="secondary" style={{fontSize:13}}>
                    {lang==="bn"
                      ? "আবেদনকারী হুবহু এই লেখাটি দেখবেন। স্পষ্ট করে লিখুন যাতে তিনি ঠিক করতে পারেন।"
                      : "The applicant sees exactly this text. Write it so they can act on it."}
                  </Paragraph>
                  <Input.TextArea rows={3} value={kycRejectReason} maxLength={500} showCount
                    onChange={e=>setKycRejectReason(e.target.value)}
                    placeholder={lang==="bn"
                      ? "যেমন: পরিচয়পত্রের ছবিটি ঝাপসা, লেখা পড়া যাচ্ছে না। আবার তুলে পাঠান।"
                      : "e.g. The photo of your ID is blurred and the text cannot be read. Please take it again."} />
                </Modal>
              </>
            )}

            {/* ── REVENUE ── */}
            {tab==="revenue" && (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
                  <Title level={4} style={{margin:0}}>💹 {lang==="bn"?"রাজস্ব ও বিশ্লেষণ":"Revenue & Analytics"}</Title>
                  <Space wrap>
                    <Button onClick={exportRevenueCSV} icon={<span>📥</span>}>{lang==="bn"?"CSV এক্সপোর্ট":"Export CSV"}</Button>
                    <Button onClick={printRevenueReport} type="primary" icon={<span>🖨️</span>}>{lang==="bn"?"রিপোর্ট প্রিন্ট":"Print Report"}</Button>
                  </Space>
                </div>
                <Row gutter={[16,16]} style={{marginBottom:24}}>
                  {(()=>{
                    const rev   = realStats?.revenue   ?? 0;
                    const lastM = monthlyRev2.length>0 ? (monthlyRev2[monthlyRev2.length-1]?.v??0) : 47800;
                    return [
                      {title:lang==="bn"?"মোট রাজস্ব":"Total Revenue",       value:`৳${Math.round(rev).toLocaleString()||" ২,৪০,৫০০"}`, color:"#006A4E"},
                      {title:lang==="bn"?"এই মাস":"This Month",              value:`৳${Math.round(lastM).toLocaleString()}`,            color:"#3B82F6"},
                      {title:lang==="bn"?"মোট বুকিং":"Total Bookings",       value:realStats?.bookings??0,                              color:"#F59E0B"},
                      {title:lang==="bn"?"KYC অপেক্ষায়":"KYC Pending",       value:realStats?.kycPending??0,                           color:"#EF4444"},
                      {title:lang==="bn"?"সক্রিয় Provider":"Active Providers",value:realStats?.providers??0,                           color:"#8B5CF6"},
                      {title:lang==="bn"?"মোট ব্যবহারকারী":"Total Users",    value:realStats?.users??0,                                color:"#00C170"},
                    ];
                  })().map((s,i)=>(
                    <Col xs={12} sm={8} lg={4} key={i}>
                      <Card bordered bodyStyle={{padding:16}}>
                        <Statistic title={<Text type="secondary" style={{fontSize:11}}>{s.title}</Text>}
                          value={s.value} valueStyle={{color:s.color,fontSize:17,fontWeight:800}} />
                      </Card>
                    </Col>
                  ))}
                </Row>
                <Row gutter={[16,16]}>
                  <Col xs={24} lg={14}>
                    <Card title={lang==="bn"?"📈 মাসিক রাজস্ব (৳)":"📈 Monthly Revenue (৳)"} bordered>
                      <div style={{display:"flex",alignItems:"flex-end",gap:10,height:140,paddingTop:8}}>
                        {(monthlyRev2.length>0?monthlyRev2:monthlyRev).map((m,i,arr)=>(
                          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                            <Text style={{fontSize:10,color:"#006A4E",fontWeight:700}}>{(m.v/1000).toFixed(0)}k</Text>
                            <div style={{width:"100%",background:i===arr.length-1?"#006A4E":"#D1FAE5",
                              borderRadius:"6px 6px 0 0",height:`${(m.v/Math.max(...arr.map(x=>x.v),1))*110}px`,minHeight:8}} />
                            <Text type="secondary" style={{fontSize:9}}>{m.m}</Text>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} lg={10}>
                    <Card title={lang==="bn"?"🏆 শীর্ষ প্রদানকারী":"🏆 Top Providers"} bordered>
                      {topProviders.map((p,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                          padding:"10px 0",borderBottom:i<2?"1px solid rgba(0,0,0,0.06)":"none"}}>
                          <Space>
                            <Avatar style={{background:"#006A4E",fontWeight:900}}>#{i+1}</Avatar>
                            <div>
                              <Text strong>{p.name}</Text><br/>
                              <Text type="secondary" style={{fontSize:11}}>{p.service} · {p.jobs} {lang==="bn"?"কাজ":"jobs"}</Text>
                            </div>
                          </Space>
                          <Text strong style={{color:"#006A4E"}}>৳{p.earned.toLocaleString()}</Text>
                        </div>
                      ))}
                    </Card>
                  </Col>
                </Row>
              </>
            )}

            {/* ── COMPLAINTS ── */}
            {tab==="complaints" && (
              <>
                <Title level={4}>⚠️ {lang==="bn"?"অভিযোগ ব্যবস্থাপনা":"Complaint Management"}</Title>
                <Space style={{marginBottom:16}} wrap>
                  {[
                    {v:"all",      l:lang==="bn"?"সব":"All"},
                    {v:"open",     l:`${lang==="bn"?"খোলা":"Open"} (${tickets.filter(t=>t.status==="open").length})`},
                    {v:"resolved", l:lang==="bn"?"সমাধান":"Resolved"},
                  ].map(f=>(
                    <Button key={f.v} type={ticketFilter===f.v?"primary":"default"} size="small" onClick={()=>{setTicketFilter(f.v);loadTickets(f.v==="all"?"":f.v);}}>{f.l}</Button>
                  ))}
                </Space>
                <Row gutter={[12,12]}>
                  {tickets.filter(t=>ticketFilter==="all"||t.status===ticketFilter).map(t=>{
                    const prioColor={high:"red",medium:"orange",low:"green"};
                    return (
                      <Col xs={24} md={12} key={t.id}>
                        <Card bordered bodyStyle={{padding:16}}
                          style={{borderLeft:`4px solid ${t.priority==="high"?"#EF4444":t.priority==="medium"?"#F59E0B":"#00C170"}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                            <div>
                              <Space style={{marginBottom:6}}>
                                <Tag color={prioColor[t.priority]}>{t.priority.toUpperCase()}</Tag>
                                <Tag color={t.status==="open"?"orange":"success"}>
                                  {t.status==="open"?(lang==="bn"?"খোলা":"Open"):(lang==="bn"?"সমাধান":"Resolved")}
                                </Tag>
                              </Space>
                              <Text strong style={{display:"block"}}>{t.issue}</Text>
                              <Text type="secondary" style={{fontSize:12}}>👤 {t.customer} → 👷 {t.provider}</Text><br/>
                              <Text type="secondary" style={{fontSize:11}}>#{t.id} · {t.date}</Text>
                            </div>
                            {t.status==="open" && (
                              <Space direction="vertical" size={4}>
                                <Button size="small" type="primary" onClick={async()=>{
                                  setTickets(tk=>tk.map(x=>x.id===t.id?{...x,status:"resolved"}:x));
                                  toast(lang==="bn"?"✅ সমাধান হয়েছে":"✅ Resolved");
                                  if(t._rawId) adminApi.resolveComp(t._rawId,{status:"resolved"}).catch(()=>{});
                                }}>{lang==="bn"?"সমাধান":"Resolve"}</Button>
                                <Button size="small" danger onClick={async()=>{
                                  setTickets(tk=>tk.map(x=>x.id===t.id?{...x,status:"closed"}:x));
                                  toast(lang==="bn"?"বন্ধ":"Closed","info");
                                  if(t._rawId) adminApi.resolveComp(t._rawId,{status:"closed"}).catch(()=>{});
                                }}>{lang==="bn"?"বন্ধ":"Close"}</Button>
                              </Space>
                            )}
                          </div>
                        </Card>
                      </Col>
                    );
                  })}
                  {tickets.filter(t=>ticketFilter==="all"||t.status===ticketFilter).length===0 && (
                    <Col span={24}><Text type="secondary">{lang==="bn"?"কোনো অভিযোগ নেই":"No complaints found"}</Text></Col>
                  )}
                </Row>
              </>
            )}

            {/* ── NOTIFICATIONS ── */}
            {tab==="notifications" && (
              <Row gutter={[16,16]}>
                <Col xs={24} lg={12}>
                  <Card title={`✍️ ${lang==="bn"?"নতুন বিজ্ঞপ্তি":"Compose Announcement"}`}
                    bordered style={{borderTop:"3px solid #006A4E"}}>
                    <Form layout="vertical" size="middle">
                      <Form.Item label={lang==="bn"?"প্রাপক":"Recipients"}>
                        <Select value={notifTarget} onChange={setNotifTarget}>
                          <Select.Option value="all">{lang==="bn"?"সবাই":"Everyone"}</Select.Option>
                          <Select.Option value="customers">{lang==="bn"?"গ্রাহকরা":"Customers"}</Select.Option>
                          <Select.Option value="providers">{lang==="bn"?"প্রদানকারীরা":"Providers"}</Select.Option>
                        </Select>
                      </Form.Item>
                      <Form.Item label={lang==="bn"?"শিরোনাম":"Title"}>
                        <Input value={notifTitle} onChange={e=>setNotifTitle(e.target.value)}
                          placeholder={lang==="bn"?"বিজ্ঞপ্তির শিরোনাম":"Announcement title"} />
                      </Form.Item>
                      <Form.Item label={lang==="bn"?"বার্তা":"Message"}>
                        <Input.TextArea rows={3} value={notifMsg} onChange={e=>setNotifMsg(e.target.value)}
                          placeholder={lang==="bn"?"বিবরণ লিখুন...":"Write message..."} />
                      </Form.Item>
                      <Button type="primary" icon={<SendOutlined/>} block loading={notifSending} onClick={async()=>{
                        if(!notifTitle.trim()||!notifMsg.trim()){toast(lang==="bn"?"শিরোনাম ও বার্তা দিন":"Enter title and message","warning");return;}
                        const titleVal=notifTitle; const msgVal=notifMsg;
                        setNotifSending(true);
                        try{await adminApi.notify({title_bn:titleVal,title_en:titleVal,body_bn:msgVal,body_en:msgVal,type:"system"});}catch(e){console.warn(e.message);}finally{setNotifSending(false);}
                        setNotifTitle("");setNotifMsg("");
                        loadAnnouncements();
                        toast(lang==="bn"?"📢 বিজ্ঞপ্তি পাঠানো হয়েছে":"📢 Sent!");
                      }}>{lang==="bn"?"পাঠান":"Send"}</Button>
                    </Form>
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card title={lang==="bn"?"পাঠানো বিজ্ঞপ্তি":"Sent Announcements"} bordered>
                    {announcements.map(a=>(
                      <Card key={a.id} size="small" style={{marginBottom:10}} bodyStyle={{padding:12}}>
                        <Text strong>{a.title}</Text><br/>
                        <Text type="secondary" style={{fontSize:12}}>{a.msg}</Text><br/>
                        <Space style={{marginTop:8}} wrap>
                          <Tag color="green">{a.target==="all"?(lang==="bn"?"সবাই":"All"):a.target}</Tag>
                          <Tag color="blue">👁️ {a.reach} {lang==="bn"?"জন":"reached"}</Tag>
                          <Text type="secondary" style={{fontSize:11}}>{a.date}</Text>
                        </Space>
                      </Card>
                    ))}
                  </Card>
                </Col>
              </Row>
            )}

            {/* ── PROMO CODES ── */}
            {tab==="promos" && (
              <>
                <Title level={4}>🎁 {lang==="bn"?"প্রোমো কোড":"Promo Codes"}</Title>
                <Card title={`➕ ${lang==="bn"?"নতুন প্রোমো":"New Promo"}`} bordered style={{marginBottom:20,borderTop:"3px solid #006A4E"}}>
                  <Row gutter={[12,12]} align="middle">
                    <Col xs={12} sm={6}>
                      <Input value={promoForm.code} onChange={e=>setPromoForm(f=>({...f,code:e.target.value.toUpperCase()}))}
                        placeholder="EID30" addonBefore={lang==="bn"?"কোড":"Code"} />
                    </Col>
                    <Col xs={12} sm={5}>
                      <Input value={promoForm.discount} onChange={e=>setPromoForm(f=>({...f,discount:e.target.value}))}
                        placeholder="20" type="number" addonBefore={lang==="bn"?"ছাড়":"Disc"} />
                    </Col>
                    <Col xs={12} sm={5}>
                      <Select value={promoForm.type} onChange={v=>setPromoForm(f=>({...f,type:v}))} style={{width:"100%"}}>
                        <Select.Option value="percent">% {lang==="bn"?"শতাংশ":"Percent"}</Select.Option>
                        <Select.Option value="flat">{lang==="bn"?"ফ্ল্যাট (৳)":"Flat (৳)"}</Select.Option>
                      </Select>
                    </Col>
                    <Col xs={12} sm={4}>
                      <Input value={promoForm.limit} onChange={e=>setPromoForm(f=>({...f,limit:e.target.value}))}
                        placeholder="500" type="number" addonBefore={lang==="bn"?"লিমিট":"Limit"} />
                    </Col>
                    <Col xs={24} sm={4}>
                      <Button type="primary" icon={<PlusOutlined/>} block loading={promoSaving} onClick={async()=>{
                        if(!promoForm.code||!promoForm.discount){toast(lang==="bn"?"কোড ও ছাড় দিন":"Enter code and discount","warning");return;}
                        setPromoSaving(true);
                        try{
                          await adminApi.promoCreate({
                            code: promoForm.code,
                            discount_pct: promoForm.type==="percent"?Number(promoForm.discount):0,
                            discount_amt: promoForm.type==="flat"?Number(promoForm.discount):0,
                            max_uses: Number(promoForm.limit)||999,
                            valid_until: "2025-12-31",
                          });
                          setPromoForm({code:"",discount:"",type:"percent",limit:""});
                          loadPromos();
                          toast(lang==="bn"?"✅ প্রোমো তৈরি হয়েছে":"✅ Promo created!");
                        }catch(e){
                          toast(lang==="bn"?"❌ ব্যর্থ হয়েছে":"❌ Failed","error");
                        }finally{setPromoSaving(false);}
                      }}>{lang==="bn"?"যোগ":"Add"}</Button>
                    </Col>
                  </Row>
                </Card>
                <Table dataSource={promos} rowKey="id" bordered size="middle"
                  columns={[
                    {title:lang==="bn"?"কোড":"Code",     dataIndex:"code",     key:"code",    render:v=><Text code strong>{v}</Text>},
                    {title:lang==="bn"?"ছাড়":"Discount", key:"disc",            render:(_,p)=>p.type==="percent"?`${p.discount}%`:`৳${p.discount}`},
                    {title:lang==="bn"?"ব্যবহার":"Uses",  key:"uses",           render:(_,p)=><Progress percent={Math.round(p.uses/p.limit*100)} size="small" format={()=>`${p.uses}/${p.limit}`} />},
                    {title:lang==="bn"?"মেয়াদ":"Expires", dataIndex:"expires",  key:"expires"},
                    {title:lang==="bn"?"অবস্থা":"Status", key:"status",          render:(_,p)=><Tag color={p.active?"success":"default"}>{p.active?(lang==="bn"?"সক্রিয়":"Active"):(lang==="bn"?"নিষ্ক্রিয়":"Inactive")}</Tag>},
                    {title:lang==="bn"?"অ্যাকশন":"Action",key:"action",         render:(_,p)=>(
                      <Space>
                        <Switch size="small" checked={p.active} onChange={()=>{
                          const newActive = !p.active;
                          setPromos(prev=>prev.map(x=>x.id===p.id?{...x,active:newActive}:x));
                          adminApi.promoToggle(p.id,{is_active:newActive}).catch(()=>{});
                          toast(lang==="bn"?"✅ আপডেট":"✅ Updated");
                        }} />
                        <Popconfirm title={lang==="bn"?"মুছে ফেলবেন?":"Delete?"} onConfirm={()=>{
                          adminApi.promoDelete(p.id).then(()=>loadPromos()).catch(()=>{});
                          setPromos(prev=>prev.filter(x=>x.id!==p.id));
                          toast(lang==="bn"?"মুছে ফেলা হয়েছে":"Deleted","warning");
                        }} okText="Yes" cancelText="No">
                          <Button size="small" danger icon={<DeleteOutlined/>} />
                        </Popconfirm>
                      </Space>
                    )},
                  ]}
                />
              </>
            )}

            {/* ── LOANS ── */}
            {tab==="loans" && (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <Title level={4}>💹 {lang==="bn"?"মাইক্রো-লোন আবেদন":"Micro Loan Applications"}</Title>
                  <Space>
                    <Select value={loanFilter} onChange={v=>{setLoanFilter(v);}} style={{width:140}}>
                      <Select.Option value="">{lang==="bn"?"সব":"All"}</Select.Option>
                      <Select.Option value="pending">{lang==="bn"?"অপেক্ষায়":"Pending"}</Select.Option>
                      <Select.Option value="approved">{lang==="bn"?"অনুমোদিত":"Approved"}</Select.Option>
                      <Select.Option value="disbursed">{lang==="bn"?"বিতরণ":"Disbursed"}</Select.Option>
                      <Select.Option value="rejected">{lang==="bn"?"প্রত্যাখ্যাত":"Rejected"}</Select.Option>
                    </Select>
                    <Button loading={loanLoading} onClick={()=>loadLoans(loanFilter)}>{lang==="bn"?"রিফ্রেশ":"Refresh"}</Button>
                  </Space>
                </div>
                <Table
                  dataSource={loanList}
                  rowKey="id"
                  loading={loanLoading}
                  bordered
                  size="middle"
                  pagination={{ pageSize: 15 }}
                  columns={[
                    { title: lang==="bn"?"আবেদনকারী":"Applicant",  key:"name",   render:(_,l)=>(
                        <div>
                          <Text strong>{l.user_name||l.full_name}</Text>
                          <div style={{fontSize:11,color:"#6b7280"}}>{l.user_phone||l.phone}</div>
                        </div>
                    )},
                    { title: lang==="bn"?"পরিমাণ":"Amount",         key:"amount", render:(_,l)=><Text strong>৳{parseFloat(l.amount).toLocaleString()}</Text> },
                    { title: lang==="bn"?"মেয়াদ":"Tenure",          key:"tenure", render:(_,l)=>`${l.tenure_months} ${lang==="bn"?"মাস":"mo"} @ ${l.interest_rate}%` },
                    { title: lang==="bn"?"লোন স্কোর":"Score",        key:"score",  render:(_,l)=><Tag color={l.loan_score>=70?"green":l.loan_score>=50?"orange":"red"}>{l.loan_score}/100</Tag> },
                    { title: lang==="bn"?"উদ্দেশ্য":"Purpose",       key:"purpose",dataIndex:"purpose", render:v=>v||"-" },
                    { title: lang==="bn"?"রেফারেন্স":"Ref No",        key:"ref",    dataIndex:"reference_no", render:v=><Text code>{v}</Text> },
                    { title: lang==="bn"?"তারিখ":"Date",              key:"date",   render:(_,l)=>new Date(l.applied_at).toLocaleDateString() },
                    { title: lang==="bn"?"অবস্থা":"Status",           key:"status", render:(_,l)=>{
                        const col={pending:"orange",approved:"cyan",disbursed:"green",rejected:"red",repaid:"default"};
                        const lbl={en:{pending:"Pending",approved:"Approved",disbursed:"Disbursed",rejected:"Rejected",repaid:"Repaid"},
                                   bn:{pending:"\u09aa\u09b0\u09cd\u09af\u09be\u09b2\u09cb\u099a\u09a8\u09be\u09a7\u09c0\u09a8",approved:"\u0985\u09a8\u09c1\u09ae\u09cb\u09a6\u09bf\u09a4",disbursed:"\u09ac\u09bf\u09a4\u09b0\u09a3",rejected:"\u09aa\u09cd\u09b0\u09a4\u09cd\u09af\u09be\u0996\u09cd\u09af\u09be\u09a4",repaid:"\u09aa\u09b0\u09bf\u09b6\u09cb\u09a7\u09bf\u09a4"}};
                        return <Tag color={col[l.status]||"default"}>{lbl[lang][l.status]||l.status}</Tag>;
                    }},
                    { title: lang==="bn"?"অ্যাকশন":"Action",          key:"action", render:(_,l)=>(
                        <Space wrap>
                          {l.status==="pending"&&<>
                            <Popconfirm title={lang==="bn"?"অনুমোদন করবেন?":"Approve?"} onConfirm={()=>updateLoan(l.id,"approved","")} okText="Yes" cancelText="No">
                              <Button size="small" type="primary">{lang==="bn"?"অনুমোদন":"Approve"}</Button>
                            </Popconfirm>
                            <Popconfirm title={lang==="bn"?"প্রত্যাখ্যান করবেন?":"Reject?"} onConfirm={()=>updateLoan(l.id,"rejected","")} okText="Yes" cancelText="No">
                              <Button size="small" danger>{lang==="bn"?"বাতিল":"Reject"}</Button>
                            </Popconfirm>
                          </>}
                          {l.status==="approved"&&(
                            <Popconfirm title={lang==="bn"?"ওয়ালেটে বিতরণ করবেন?":"Disburse to wallet?"} onConfirm={()=>updateLoan(l.id,"disbursed","")} okText="Yes" cancelText="No">
                              <Button size="small" type="primary" style={{background:"#006A4E",borderColor:"#006A4E"}}>{lang==="bn"?"বিতরণ":"Disburse"}</Button>
                            </Popconfirm>
                          )}
                        </Space>
                    )},
                  ]}
                />
              </>
            )}

            {/* ── CATEGORIES ── */}
            {tab==="categories" && (
              <>
                <Title level={4}>🗂️ {lang==="bn"?"সেবা বিভাগ":"Service Categories"}</Title>
                <Card title={`➕ ${lang==="bn"?"নতুন বিভাগ":"New Category"}`} bordered style={{marginBottom:20,borderTop:"3px solid #006A4E"}}>
                  <Space wrap>
                    <Input value={newCat.icon} onChange={e=>setNewCat(c=>({...c,icon:e.target.value}))}
                      placeholder="🔧" style={{width:60,textAlign:"center",fontSize:20}} />
                    <Input value={newCat.name} onChange={e=>setNewCat(c=>({...c,name:e.target.value}))}
                      placeholder={lang==="bn"?"বিভাগের নাম":"Category name"} style={{width:200}} />
                    <Button type="primary" icon={<PlusOutlined/>} onClick={()=>{
                      if(!newCat.name){toast(lang==="bn"?"নাম দিন":"Enter name","warning");return;}
                      const slug = newCat.name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"") || "cat-"+Date.now();
                      servicesApi.create({slug, name_bn:newCat.name, name_en:newCat.name, icon:newCat.icon||"\ud83d\udd27"})
                        .then(()=>loadCategories()).catch(()=>{});
                      setCategories(c=>[...c,{id:Date.now(),icon:newCat.icon||"🔧",name:newCat.name,providers:0,active:true}]);
                      setNewCat({icon:"",name:""});
                      toast(lang==="bn"?"✅ বিভাগ যোগ":"✅ Added");
                    }}>{lang==="bn"?"যোগ করুন":"Add"}</Button>
                  </Space>
                </Card>
                <Table dataSource={categories} rowKey="id" bordered size="middle"
                  columns={[
                    {title:lang==="bn"?"আইকন":"Icon",   dataIndex:"icon",      key:"icon",    render:v=><span style={{fontSize:24}}>{v}</span>, width:70},
                    {title:lang==="bn"?"নাম":"Name",    dataIndex:"name",      key:"name",    render:n=><Text strong>{n}</Text>},
                    {title:lang==="bn"?"প্রদানকারী":"Providers", dataIndex:"providers", key:"providers"},
                    {title:lang==="bn"?"অবস্থা":"Status", key:"status",        render:(_,c)=><Tag color={c.active?"success":"default"}>{c.active?(lang==="bn"?"সক্রিয়":"Active"):(lang==="bn"?"বন্ধ":"Off")}</Tag>},
                    {title:lang==="bn"?"টগল":"Toggle",  key:"toggle",          render:(_,c)=><Switch checked={c.active} onChange={()=>{
                      const newActive = !c.active;
                      setCategories(prev=>prev.map(x=>x.id===c.id?{...x,active:newActive}:x));
                      servicesApi.update(c.id,{is_active:newActive?1:0}).catch(()=>{});
                      toast(lang==="bn"?"আপডেট":"Updated");
                    }} />},
                  ]}
                />
              </>
            )}

            {/* ── AI ANALYTICS ── */}
            {tab==="ai" && (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                  <Title level={4}>🤖 {lang==="bn"?"AI Analytics ড্যাশবোর্ড":"AI Analytics Dashboard"}</Title>
                  <Button type="primary" loading={aiLoading} onClick={loadAiData}>{lang==="bn"?"রিফ্রেশ":"Refresh"}</Button>
                </div>

                {/* Revenue Forecast */}
                <Row gutter={[14,14]} style={{marginBottom:16}}>
                  <Col xs={24} lg={12}>
                    <Card title={`📈 ${lang==="bn"?"রাজস্ব পূর্বাভাস":"Revenue Forecast"}`} bordered style={{borderTop:"3px solid #006A4E"}}>
                      {aiForecast?.forecastRevenue?.length ? (
                        <div style={{display:"flex",gap:16,marginBottom:10}}>
                          {aiForecast.forecastRevenue.map((f,i)=>(
                            <div key={i} style={{flex:1,textAlign:"center",padding:"12px 6px",background:`rgba(5,150,105,${0.08*(i+1)})`,borderRadius:10}}>
                              <div style={{fontSize:12,color:"#666",marginBottom:4}}>{f.label}</div>
                              <div style={{fontSize:18,fontWeight:700,color:"#006A4E"}}>৳{(f.value/1000).toFixed(1)}k</div>
                              <Tag color="green" style={{marginTop:4}}>↑{f.growth}</Tag>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{textAlign:"center",padding:"30px 0",color:"#888"}}>
                          <div style={{fontSize:36,marginBottom:8}}>📊</div>
                          <div style={{fontSize:13}}>{lang==="bn"?"ডেটা লোড হচ্ছে...":"Loading data..."}</div>
                        </div>
                      )}
                      {/* Monthly bar chart (CSS-based) */}
                      {(()=>{
                        const chartData = monthlyRev2.length > 0 ? monthlyRev2 : monthlyRev;
                        const chartMax  = Math.max(...chartData.map(x=>x.v), 1);
                        return chartData.length > 0 ? (
                          <div style={{marginTop:8}}>
                            <div style={{fontSize:11,color:"#888",marginBottom:6}}>{lang==="bn"?"গত ৬ মাস":"Last 6 months"}</div>
                            <div style={{display:"flex",gap:5,alignItems:"flex-end",height:60}}>
                              {chartData.map((m,i)=>(
                                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                  <div style={{width:"100%",background:"#006A4E",borderRadius:"4px 4px 0 0",height:Math.round((m.v/chartMax)*52),minHeight:4,transition:"height .3s"}} />
                                  <div style={{fontSize:9,color:"#888"}}>{m.m}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </Card>
                  </Col>

                  {/* Service Demand */}
                  <Col xs={24} lg={12}>
                    <Card title={`🔥 ${lang==="bn"?"সেবার চাহিদা (৩০ দিন)":"Service Demand (30 days)"}`} bordered style={{borderTop:"3px solid #F59E0B"}}>
                      {aiForecast?.serviceDemand?.length ? (
                        aiForecast.serviceDemand.slice(0,6).map((s,i)=>(
                          <div key={i} style={{marginBottom:8}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                              <Text style={{fontSize:12}}>{s.service||"—"}</Text>
                              <Text strong style={{fontSize:12}}>{s.count}</Text>
                            </div>
                            <Progress percent={Math.round(s.count/(aiForecast.serviceDemand[0]?.count||1)*100)} showInfo={false} strokeColor="#F59E0B" size="small" />
                          </div>
                        ))
                      ) : (
                        <div style={{textAlign:"center",padding:"30px 0",color:"#888"}}>
                          <div style={{fontSize:11}}>{lang==="bn"?"বুকিং ডেটা নেই":"No booking data yet"}</div>
                        </div>
                      )}
                    </Card>
                  </Col>
                </Row>

                {/* Churn Risk */}
                <Row gutter={[14,14]} style={{marginBottom:16}}>
                  <Col xs={24} lg={12}>
                    <Card
                      title={`⚠️ ${lang==="bn"?"ঝুঁকিপূর্ণ প্রদানকারী":"At-Risk Providers"} (${aiChurn?.providerChurn?.length||0})`}
                      bordered style={{borderTop:"3px solid #EF4444"}}
                    >
                      {aiChurn?.providerChurn?.length ? (
                        <Table
                          dataSource={aiChurn.providerChurn}
                          rowKey="id"
                          size="small"
                          pagination={false}
                          scroll={{x:400}}
                          columns={[
                            {title:lang==="bn"?"নাম":"Name",         dataIndex:"name",          key:"name", render:n=><Text strong style={{fontSize:12}}>{n}</Text>},
                            {title:lang==="bn"?"সেবা":"Service",     dataIndex:"service_type",  key:"service", render:v=><Text style={{fontSize:11}}>{v||"—"}</Text>},
                            {title:lang==="bn"?"নিষ্ক্রিয় দিন":"Inactive Days", dataIndex:"days_inactive", key:"days",render:v=><Tag color={v>60?"error":"warning"}>{v}d</Tag>},
                            {title:"Risk", dataIndex:"churnRisk", key:"risk", render:v=><Tag color={v==="high"?"error":"warning"}>{v}</Tag>},
                          ]}
                        />
                      ) : (
                        <Alert type="success" message={lang==="bn"?"সকল provider সক্রিয়! ✅":"All providers are active! ✅"} />
                      )}
                    </Card>
                  </Col>

                  <Col xs={24} lg={12}>
                    <Card
                      title={`💤 ${lang==="bn"?"নিষ্ক্রিয় গ্রাহক":"Inactive Customers"} (${aiChurn?.customerChurn?.length||0})`}
                      bordered style={{borderTop:"3px solid #6366F1"}}
                    >
                      {aiChurn?.customerChurn?.length ? (
                        <Table
                          dataSource={aiChurn.customerChurn}
                          rowKey="id"
                          size="small"
                          pagination={false}
                          scroll={{x:400}}
                          columns={[
                            {title:lang==="bn"?"নাম":"Name",        dataIndex:"name",             key:"name", render:n=><Text strong style={{fontSize:12}}>{n}</Text>},
                            {title:lang==="bn"?"মোট বুকিং":"Bookings", dataIndex:"total_bookings",  key:"total"},
                            {title:lang==="bn"?"শেষ বুকিং":"Last Booked", dataIndex:"days_since_last", key:"days",render:v=><Tag color={v>60?"error":"warning"}>{v}d ago</Tag>},
                            {title:"Risk", dataIndex:"churnRisk", key:"risk", render:v=><Tag color={v==="high"?"error":"warning"}>{v}</Tag>},
                          ]}
                        />
                      ) : (
                        <Alert type="success" message={lang==="bn"?"সকল গ্রাহক সক্রিয়! ✅":"All customers active! ✅"} />
                      )}
                    </Card>
                  </Col>
                </Row>

                {/* Area Heatmap */}
                <Card title={`🗺️ ${lang==="bn"?"এলাকা চাহিদা হিটম্যাপ":"Area Demand Heatmap"}`} bordered style={{borderTop:"3px solid #0EA5E9",marginBottom:16}}>
                  {aiHeatmap?.heatmap?.length ? (
                    <Row gutter={[10,10]}>
                      {aiHeatmap.heatmap.slice(0,12).map((h,i)=>{
                        const maxBookings = aiHeatmap.heatmap[0]?.total_bookings||1;
                        const intensity   = h.total_bookings/maxBookings;
                        return (
                          <Col key={i} xs={12} sm={8} md={6}>
                            <div style={{padding:"10px 12px",borderRadius:10,background:`rgba(14,165,233,${0.1+intensity*0.6})`,border:"1px solid rgba(14,165,233,0.3)"}}>
                              <div style={{fontSize:12,fontWeight:700,marginBottom:2}}>{h.area}</div>
                              <div style={{fontSize:11,color:"#555"}}>{h.total_bookings} {lang==="bn"?"বুকিং":"bookings"}</div>
                              <Tag color={h.status==="undersupplied"?"error":"success"} style={{marginTop:4,fontSize:10}}>
                                {h.status==="undersupplied"?(lang==="bn"?"স্বল্প সরবরাহ":"Undersupplied"):(lang==="bn"?"স্বাভাবিক":"Balanced")}
                              </Tag>
                            </div>
                          </Col>
                        );
                      })}
                    </Row>
                  ) : (
                    <div style={{textAlign:"center",padding:"32px 0",color:"#888"}}>
                      <div style={{fontSize:40,marginBottom:8}}>🗺️</div>
                      <div style={{fontSize:13}}>{lang==="bn"?"এলাকার ডেটা এখনো নেই। বুকিং এলে হিটম্যাপ দেখা যাবে।":"Area data will show here as bookings come in."}</div>
                    </div>
                  )}
                </Card>

                {/* AI Feature Cards */}
                <Row gutter={[14,14]}>
                  {[
                    {ic:"🤖",lbn:"Real AI Chatbot",len:"Real AI Chatbot",d_bn:"OpenAI GPT-4o-mini + স্মার্ট বাংলা ফলব্যাক সক্রিয়",d_en:"OpenAI GPT-4o-mini + Smart Bangla fallback active",color:"#006A4E"},
                    {ic:"🎙️",lbn:"ভয়েস ইনপুট",len:"Voice Input",d_bn:"Web Speech API — বাংলা ও ইংরেজি সাপোর্ট",d_en:"Web Speech API — Bangla & English supported",color:"#6366F1"},
                    {ic:"🎯",lbn:"স্মার্ট ম্যাচিং",len:"Smart Matching",d_bn:"AI স্কোর দিয়ে provider র‍্যাংকিং",d_en:"AI-scored provider ranking",color:"#F59E0B"},
                    {ic:"💰",lbn:"ডায়নামিক প্রাইসিং",len:"Dynamic Pricing",d_bn:"চাহিদা ও সময়ভিত্তিক মূল্য",d_en:"Demand & time-based pricing",color:"#EF4444"},
                    {ic:"🛡️",lbn:"ফ্রড ডিটেকশন",len:"Fraud Detection",d_bn:"সন্দেহজনক বুকিং স্বয়ংক্রিয়ভাবে ফ্ল্যাগ",d_en:"Auto-flag suspicious bookings",color:"#0EA5E9"},
                    {ic:"⭐",lbn:"ফেক রিভিউ চেক",len:"Fake Review Check",d_bn:"নকল রিভিউ AI দিয়ে শনাক্ত",d_en:"Detect fake reviews with AI",color:"#8B5CF6"},
                    {ic:"📦",lbn:"বান্ডেল সাজেশন",len:"Bundle Suggest",d_bn:"বুকিং পরে পরিপূরক সেবা সাজেস্ট",d_en:"Suggest complementary services post-booking",color:"#00C170"},
                    {ic:"📉",lbn:"চার্ন প্রেডিকশন",len:"Churn Prediction",d_bn:"নিষ্ক্রিয় ব্যবহারকারী শনাক্ত",d_en:"Identify inactive users about to leave",color:"#F97316"},
                  ].map((f,i)=>(
                    <Col key={i} xs={24} sm={12} md={6}>
                      <Card bordered style={{borderTop:`3px solid ${f.color}`,textAlign:"center"}}>
                        <div style={{fontSize:28,marginBottom:6}}>{f.ic}</div>
                        <Text strong style={{fontSize:13,display:"block",marginBottom:4}}>{lang==="bn"?f.lbn:f.len}</Text>
                        <Text type="secondary" style={{fontSize:11}}>{lang==="bn"?f.d_bn:f.d_en}</Text>
                        <Tag color="success" style={{marginTop:8,display:"block"}}>✅ Active</Tag>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </>
            )}

            {/* ── SOS ALERTS ── */}
            {tab==="sos" && (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
                  <Title level={4} style={{margin:0}}>🆘 {lang==="bn"?"SOS জরুরি সতর্কতা":"SOS Emergency Alerts"}</Title>
                  <Button onClick={loadSos} loading={sosLoading}>{lang==="bn"?"রিফ্রেশ":"Refresh"}</Button>
                </div>
                <Row gutter={[12,12]} style={{marginBottom:20}}>
                  {[["open","#EF4444",lang==="bn"?"খোলা":"Open"],["in_progress","#F59E0B",lang==="bn"?"প্রক্রিয়াধীন":"In Progress"],["resolved","#006A4E",lang==="bn"?"সমাধান":"Resolved"]].map(([s,c,l])=>(
                    <Col xs={8} key={s}>
                      <Card style={{borderTop:`3px solid ${c}`,textAlign:"center",padding:"12px 0"}}>
                        <div style={{fontSize:22,fontWeight:800,color:c}}>{sosAlerts.filter(a=>a.status===s).length}</div>
                        <div style={{fontSize:12,color:"#6B7280"}}>{l}</div>
                      </Card>
                    </Col>
                  ))}
                </Row>
                <Table
                  loading={sosLoading}
                  dataSource={sosAlerts}
                  rowKey="id"
                  size="small"
                  pagination={{pageSize:20}}
                  columns={[
                    {title:"ID",dataIndex:"id",width:60},
                    {title:lang==="bn"?"ব্যবহারকারী":"User",render:(_,r)=><div><div style={{fontWeight:600}}>{r.user_name}</div><div style={{fontSize:11,color:"#6B7280"}}>{r.user_phone}</div></div>},
                    {title:lang==="bn"?"ধরন":"Type",dataIndex:"type",render:t=><Tag color={t==="emergency"||t==="harassment"?"red":t==="fraud"?"orange":"default"}>{t.toUpperCase()}</Tag>},
                    {title:lang==="bn"?"বিবরণ":"Description",dataIndex:"description",ellipsis:true},
                    {title:lang==="bn"?"অবস্থা":"Status",dataIndex:"status",render:s=><Tag color={s==="open"?"red":s==="in_progress"?"orange":"green"}>{s}</Tag>},
                    {title:lang==="bn"?"সময়":"Time",dataIndex:"created_at",render:t=>new Date(t).toLocaleString("bn-BD")},
                    {title:lang==="bn"?"ব্যবস্থা":"Action",render:(_,r)=>(
                      <Space size="small">
                        {r.status==="open"&&<Button size="small" type="primary" style={{background:"#F59E0B",borderColor:"#F59E0B"}}
                          onClick={async()=>{await sosApi?.update(r.id,"in_progress","Admin investigating");loadSos();}}>
                          {lang==="bn"?"তদন্ত":"Investigate"}
                        </Button>}
                        {r.status!=="resolved"&&<Button size="small" style={{background:"#006A4E",borderColor:"#006A4E",color:"#fff"}}
                          onClick={async()=>{await sosApi?.update(r.id,"resolved","Resolved by admin");loadSos();}}>
                          {lang==="bn"?"সমাধান":"Resolve"}
                        </Button>}
                      </Space>
                    )},
                  ]}
                />
              </div>
            )}

            {/* ── PAYMENTS ── */}
            {tab==="payments" && (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
                  <Title level={4} style={{margin:0}}>💳 {lang==="bn"?"পেমেন্ট ইতিহাস":"Payment History"}</Title>
                  <Space wrap>
                    <Select value={payFilter} onChange={v=>{setPayFilter(v);loadPayments(v);}} style={{width:140}}
                      options={[
                        {value:"",   label:lang==="bn"?"সব অবস্থা":"All Status"},
                        {value:"pending",  label:lang==="bn"?"অপেক্ষায়":"Pending"},
                        {value:"success",  label:lang==="bn"?"সফল":"Success"},
                        {value:"failed",   label:lang==="bn"?"ব্যর্থ":"Failed"},
                        {value:"cancelled",label:lang==="bn"?"বাতিল":"Cancelled"},
                        {value:"refunded", label:lang==="bn"?"ফেরত":"Refunded"},
                      ]}/>
                    <Button onClick={()=>loadPayments(payFilter)} loading={payLoading}>{lang==="bn"?"রিফ্রেশ":"Refresh"}</Button>
                  </Space>
                </div>
                <Row gutter={[12,12]} style={{marginBottom:20}}>
                  {[
                    ["success",  "#006A4E", lang==="bn"?"সফল":"Success"],
                    ["pending",  "#F59E0B", lang==="bn"?"অপেক্ষায়":"Pending"],
                    ["failed",   "#EF4444", lang==="bn"?"ব্যর্থ":"Failed"],
                    ["cancelled","#6B7280", lang==="bn"?"বাতিল":"Cancelled"],
                  ].map(([s,c,l])=>(
                    <Col xs={12} sm={6} key={s}>
                      <Card style={{borderTop:`3px solid ${c}`,textAlign:"center",padding:"12px 0"}}>
                        <div style={{fontSize:22,fontWeight:800,color:c}}>{payList.filter(p=>p.status===s).length}</div>
                        <div style={{fontSize:12,color:"#6B7280"}}>{l}</div>
                      </Card>
                    </Col>
                  ))}
                </Row>
                <Table
                  loading={payLoading}
                  dataSource={payList}
                  rowKey="id"
                  size="small"
                  pagination={{pageSize:20}}
                  scroll={{x:900}}
                  columns={[
                    {title:"ID",dataIndex:"id",width:90,render:v=>v?.slice(0,8)+"…"},
                    {title:lang==="bn"?"ব্যবহারকারী":"User",   render:(_,r)=><div><div style={{fontWeight:600}}>{r.user_name||r.user_id}</div><div style={{fontSize:11,color:"#6B7280"}}>{r.user_phone}</div></div>},
                    {title:lang==="bn"?"পরিমাণ":"Amount",      dataIndex:"amount",render:v=><span style={{fontWeight:700}}>৳{parseFloat(v||0).toLocaleString()}</span>},
                    {title:lang==="bn"?"পদ্ধতি":"Method",      dataIndex:"method",render:v=><Tag>{v||"sslcommerz"}</Tag>},
                    {title:lang==="bn"?"অবস্থা":"Status",      dataIndex:"status",render:s=>{
                      const c={success:"green",pending:"orange",failed:"red",cancelled:"default",refunded:"purple"};
                      return <Tag color={c[s]||"default"}>{s?.toUpperCase()}</Tag>;
                    }},
                    {title:lang==="bn"?"ট্রান্সেকশন ID":"Txn ID", dataIndex:"gateway_tran_id",ellipsis:true,render:v=>v||"—"},
                    {title:lang==="bn"?"বুকিং":"Booking",      dataIndex:"booking_id",render:v=>v?v.slice(0,8)+"…":"—"},
                    {title:lang==="bn"?"সময়":"Time",           dataIndex:"created_at",render:t=>t?new Date(t).toLocaleString("bn-BD"):"—",width:140},
                  ]}
                />
              </div>
            )}

            {/* ── SETTINGS ── */}
            {tab==="settings" && (
              <Row gutter={[16,16]}>
                <Col xs={24} md={12}>
                  <Card title={`⚙️ ${lang==="bn"?"সিস্টেম সেটিংস":"System Settings"}`} bordered>
                    {sysSettingsList.map((item,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                        padding:"14px 0",borderBottom:i<sysSettingsList.length-1?"1px solid rgba(0,0,0,0.06)":"none"}}>
                        <Space>
                          <span style={{fontSize:20}}>{item.icon}</span>
                          <Text style={{fontSize:14}}>{lang==="bn"?item.lbn:item.len}</Text>
                        </Space>
                        <Switch checked={sysToggles[i]} onChange={async()=>{
                          const newVal = !sysToggles[i];
                          setSysToggles(t=>{const n=[...t];n[i]=newVal;return n;});
                          const keys=["system_online","maintenance_mode","sms_notifications","ai_matching","payment_gateway","nid_verification"];
                          await adminApi.saveSettings(keys[i], newVal).catch(()=>{});
                          toast(lang==="bn"?"✅ সেটিংস সংরক্ষিত":"✅ Setting saved");
                        }} />
                      </div>
                    ))}
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card title={`📊 ${lang==="bn"?"সিস্টেম তথ্য":"System Info"}`} bordered>
                    {[
                      ["Version","v5.0.0"],
                      ["Environment","Production"],
                      ["Database","MySQL 10.4 (XAMPP)"],
                      ["Backend","Express.js v4"],
                      ["Frontend","Vite + React"],
                      ["Last Deploy", new Date().toLocaleDateString()],
                    ].map(([k,v])=>(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
                        <Text type="secondary">{k}</Text>
                        <Text strong>{v}</Text>
                      </div>
                    ))}
                  </Card>
                </Col>
              </Row>
            )}

          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

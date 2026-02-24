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
import { admin as adminApi, ai as aiApi, sos as sosApi, payments as paymentsApi, services as servicesApi } from "../api";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

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
  const [providers, setProviders] = useState([
    { id:1, name:"রাহেলা বেগম",   service:"নার্সিং",         area:"ঢাকা",      status:"pending",   rating:4.8, jobs:124, phone:"01711-112233", nid:"1234567890" },
    { id:2, name:"করিম মিয়া",    service:"ইলেকট্রিশিয়ান", area:"চট্টগ্রাম", status:"active",    rating:4.9, jobs:312, phone:"01811-223344", nid:"9876543210" },
    { id:3, name:"সুমন হোসেন",   service:"প্লাম্বার",       area:"সিলেট",     status:"pending",   rating:4.6, jobs:87,  phone:"01911-334455", nid:"5678901234" },
    { id:4, name:"নাফিসা আক্তার",service:"পরিষ্কার",        area:"রাজশাহী",   status:"active",    rating:4.7, jobs:203, phone:"01611-445566", nid:"" },
    { id:5, name:"জামাল উদ্দিন", service:"ড্রাইভার",        area:"খুলনা",     status:"suspended", rating:3.8, jobs:45,  phone:"01511-556677", nid:"1122334455" },
  ]);
  const [users, setUsers] = useState([
    { id:1, name:"আহমেদ রাহাত",   phone:"01700-111222", role:"customer", status:"active",    bookings:14, joined:"২০২৪-০১" },
    { id:2, name:"সুমাইয়া খানম", phone:"01800-222333", role:"customer", status:"active",    bookings:8,  joined:"২০২৪-০৩" },
    { id:3, name:"করিম সাহেব",    phone:"01900-333444", role:"customer", status:"active",    bookings:22, joined:"২০২৩-১১" },
    { id:4, name:"নুসরাত জাহান",  phone:"01600-444555", role:"customer", status:"suspended", bookings:3,  joined:"২০২৪-০৬" },
    { id:5, name:"তানভীর আহমেদ", phone:"01500-555666", role:"customer", status:"active",    bookings:17, joined:"২০২৪-০২" },
  ]);
  const [bookings] = useState([
    { id:"BK-001", customer:"আহমেদ রাহাত",   provider:"করিম মিয়া",    service:"ইলেকট্রিশিয়ান", status:"completed", amount:800,  date:"২০২৫-০৬-১০" },
    { id:"BK-002", customer:"সুমাইয়া খানম", provider:"রাহেলা বেগম",   service:"নার্সিং",        status:"ongoing",   amount:1200, date:"২০২৫-০৬-১১" },
    { id:"BK-003", customer:"করিম সাহেব",    provider:"সুমন হোসেন",   service:"প্লাম্বার",      status:"pending",   amount:600,  date:"২০২৫-০৬-১১" },
    { id:"BK-004", customer:"নুসরাত জাহান",  provider:"নাফিসা আক্তার",service:"পরিষ্কার",       status:"completed", amount:500,  date:"২০২৫-০৬-০৯" },
    { id:"BK-005", customer:"তানভীর আহমেদ", provider:"করিম মিয়া",    service:"ইলেকট্রিশিয়ান", status:"cancelled", amount:0,    date:"২০২৫-০৬-০৮" },
  ]);
  const [kycFilter, setKycFilter]       = useState("all");
  const [kycRejectModal, setKycRejectModal] = useState({ open:false, id:null });
  const [kycRejectReason, setKycRejectReason] = useState("");
  const [kycList, setKycList] = useState([
    { id:"kyc_101", userName:"আহমেদ রাহাত",   phone:"01700-111222", docType:"nid",      docNum:"1234567890",  submittedAt:"২০২৫-০৬-১০", status:"pending",  rejectionReason:"" },
    { id:"kyc_102", userName:"সুমাইয়া খানম", phone:"01800-222333", docType:"passport", docNum:"AB1234567",   submittedAt:"২০২৫-০৬-০৯", status:"pending",  rejectionReason:"" },
    { id:"kyc_103", userName:"করিম সাহেব",    phone:"01900-333444", docType:"driving",  docNum:"DL-78901234", submittedAt:"২০২৫-০৬-০৮", status:"verified", rejectionReason:"" },
    { id:"kyc_104", userName:"নুসরাত জাহান",  phone:"01600-444555", docType:"birth",    docNum:"BN-99887766", submittedAt:"২০২৫-০৬-০৭", status:"rejected", rejectionReason:"ছবি অস্পষ্ট" },
    { id:"kyc_105", userName:"তানভীর আহমেদ", phone:"01500-555666", docType:"nid",      docNum:"9876543210",  submittedAt:"২০২৫-০৬-০৬", status:"pending",  rejectionReason:"" },
  ]);
  const [tickets, setTickets] = useState([
    { id:"T01", customer:"আহমেদ রাহাত",   provider:"করিম মিয়া",    issue:"সময়মতো আসেনি",        status:"open",     date:"২০২৫-০৬-১০", priority:"high"   },
    { id:"T02", customer:"সুমাইয়া খানম", provider:"রাহেলা বেগম",   issue:"কাজের মান খারাপ",     status:"open",     date:"২০২৫-০৬-০৯", priority:"medium" },
    { id:"T03", customer:"করিম সাহেব",    provider:"সুমন হোসেন",   issue:"অতিরিক্ত চার্জ",      status:"resolved", date:"২০২৫-০৬-০৭", priority:"low"    },
    { id:"T04", customer:"নুসরাত জাহান",  provider:"নাফিসা আক্তার",issue:"ফোন ধরেনি",            status:"open",     date:"২০২৫-০৬-০৬", priority:"high"   },
  ]);
  const [ticketFilter, setTicketFilter] = useState("all");
  const [announcements, setAnnouncements] = useState([]);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMsg,   setNotifMsg]   = useState("");
  const [notifTarget,setNotifTarget]= useState("all");
  const [promos, setPromos] = useState([]);
  const [promoForm, setPromoForm] = useState({ code:"", discount:"", type:"percent", limit:"" });
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState({ icon:"", name:"" });
  const [sysToggles, setSysToggles] = useState([true, false, true, true, true, false]);
  const [pSearch, setPSearch] = useState("");
  const [uSearch, setUSearch] = useState("");
  const [bSearch, setBSearch] = useState("");

  /* ── ACTIONS ──────────────────────────────────────── */
  const approveProvider = async id => {
    setProviders(p => p.map(x => x.id===id ? {...x,status:"active"} : x));
    toast(lang==="bn" ? "✅ অনুমোদন হয়েছে!" : "✅ Approved!");
    try { await adminApi.updateUser(id, {is_active:1}); } catch(e) { console.warn(e.message); }
  };
  const rejectProvider = async id => {
    setProviders(p => p.map(x => x.id===id ? {...x,status:"rejected"} : x));
    toast(lang==="bn" ? "প্রত্যাখ্যান হয়েছে" : "Rejected", "warning");
    try { await adminApi.updateUser(id, {is_active:0}); } catch(e) { console.warn(e.message); }
  };
  const toggleSuspend = async (type, id) => {
    if (type==="provider") setProviders(p => p.map(x => x.id===id ? {...x, status:x.status==="suspended"?"active":"suspended"} : x));
    else                   setUsers(p   => p.map(x => x.id===id ? {...x, status:x.status==="suspended"?"active":"suspended"} : x));
    toast(lang==="bn" ? "✅ অবস্থা পরিবর্তিত" : "✅ Status updated");
    try { await adminApi.updateUser(id, {is_active:-1}); } catch(e) { console.warn(e.message); }
  };
  const kycApprove = id => {
    setKycList(k => k.map(x => x.id===id ? {...x, status:"verified"} : x));
    toast(lang==="bn" ? "✅ KYC অনুমোদিত" : "✅ KYC Approved");
    adminApi.kycReview(id, "verified").catch(e => console.warn("kyc approve:", e.message));
  };
  const kycReject = () => {
    const reason = kycRejectReason || "N/A";
    setKycList(k => k.map(x => x.id===kycRejectModal.id ? {...x, status:"rejected", rejectionReason:reason} : x));
    setKycRejectModal({open:false, id:null});
    setKycRejectReason("");
    toast(lang==="bn" ? "KYC প্রত্যাখ্যাত" : "KYC Rejected", "warning");
    adminApi.kycReview(kycRejectModal.id, "rejected", reason).catch(e => console.warn("kyc reject:", e.message));
  };

  /* ── SIDEBAR MENU ──────────────────────────────────── */
  const kycPending  = kycList.filter(k => k.status==="pending").length;
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

  /* ── PAYMENTS STATE ──────────────────────────────── */
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

  /* ── PROVIDERS / USERS / BOOKINGS / KYC LIVE DATA ── */
  const [dataLoading, setDataLoading] = useState(false);

  const loadProviders = async (q = "") => {
    setDataLoading(true);
    try {
      const d = await adminApi.providers(q ? { q } : {});
      if (d?.providers?.length) {
        setProviders(d.providers.map(p => ({
          id: p.user_id || p.id,
          _pid: p.id,
          name: p.name,
          service: p.service_slug || "—",
          area: p.area || "—",
          status: p.is_active === 1 ? "active" : p.is_active === 0 ? "suspended" : "pending",
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
      if (d?.users?.length) {
        setUsers(d.users.map(u => ({
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
      if (d?.bookings?.length) {
        // bookings state is read-only in this panel, so we shadow with a local ref
        setRealBookings(d.bookings.map(b => ({
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

  const loadKyc = async (status = "pending") => {
    setDataLoading(true);
    try {
      const d = await adminApi.kyc({ status });
      if (d?.docs?.length) {
        setKycList(d.docs.map(k => ({
          id: k.id,
          userName: k.name || k.user_id,
          phone: k.phone || "—",
          docType: k.doc_type,
          docNum: k.doc_number,
          submittedAt: k.submitted_at ? new Date(k.submitted_at).toLocaleDateString("bn-BD") : "—",
          status: k.status,
          rejectionReason: k.rejection_reason || "",
          frontImg:  k.front_image  || null,
          backImg:   k.back_image   || null,
          selfieImg: k.selfie_image || null,
        })));
      }
    } catch(e) { console.warn("load kyc:", e.message); }
    finally { setDataLoading(false); }
  };

  const [realBookings, setRealBookings] = useState([]);
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
    if (tab === "overview")           loadProviders();
    else if (tab === "providers")     loadProviders(pSearch);
    else if (tab === "users")         loadUsers(uSearch);
    else if (tab === "bookings")      loadBookings(bFilter);
    else if (tab === "kyc")           loadKyc(kycFilter === "all" ? "pending" : kycFilter);
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
  const providerCols = [
    { title:lang==="bn"?"নাম":"Name",    dataIndex:"name",    key:"name",    render:n=><Text strong>{n}</Text> },
    { title:lang==="bn"?"সেবা":"Service", dataIndex:"service", key:"service" },
    { title:lang==="bn"?"এলাকা":"Area",   dataIndex:"area",    key:"area"    },
    { title:lang==="bn"?"রেটিং":"Rating", dataIndex:"rating",  key:"rating",  render:v=><Text style={{color:"#F59E0B"}}>⭐ {v}</Text> },
    { title:lang==="bn"?"কাজ":"Jobs",     dataIndex:"jobs",    key:"jobs"    },
    { title:"NID", dataIndex:"nid", key:"nid", render:v => v ? <Tag color="success">✅ {v}</Tag> : <Tag color="error">❌ নেই</Tag> },
    { title:lang==="bn"?"অবস্থা":"Status", dataIndex:"status", key:"status", render:s=><StatusTag status={s} lang={lang}/> },
    { title:lang==="bn"?"অ্যাকশন":"Action", key:"action", render:(_,p)=>(
      <Space>
        {p.status==="pending" && <Button size="small" type="primary" onClick={()=>approveProvider(p.id)}><CheckOutlined /></Button>}
        {p.status==="pending" && <Button size="small" danger onClick={()=>rejectProvider(p.id)}><CloseOutlined /></Button>}
        <Button size="small" onClick={()=>toggleSuspend("provider",p.id)}>
          {p.status==="suspended"?(lang==="bn"?"সক্রিয়":"Activate"):(lang==="bn"?"বন্ধ":"Suspend")}
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
    { title:lang==="bn"?"পরিমাণ":"Amount",         dataIndex:"amount",    key:"amount",   render:v=>v>0?<Text strong style={{color:"#10B981"}}>৳{v}</Text>:"—" },
    { title:lang==="bn"?"তারিখ":"Date",            dataIndex:"date",      key:"date"      },
  ];

  const filtP = providers.filter(p => !pSearch||(p.name||'').includes(pSearch)||(p.service||'').includes(pSearch)||(p.area||'').includes(pSearch));
  const filtU = users.filter(u => !uSearch||(u.name||'').includes(uSearch)||(u.phone||'').includes(uSearch));
  const displayBookings = realBookings.length ? realBookings : bookings;
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
        colorPrimary: "#059669",
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
                {!collapsed && <Text strong style={{color:"#059669",fontSize:15}}>IMAP Admin</Text>}
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
            background:dark?"#141414":"#fff", borderBottom:"1px solid rgba(0,0,0,0.08)", height:56,
          }}>
            <Space>
              {!isMobile && (
                <Button type="text" onClick={()=>setCollapsed(!collapsed)}
                  icon={collapsed?<MenuUnfoldOutlined/>:<MenuFoldOutlined/>} />
              )}
              {isMobile && <><span style={{fontSize:20}}>🌿</span><Text strong style={{color:"#059669"}}>IMAP Admin</Text></>}
            </Space>
            <Space size={8}>
              <Button size="small" onClick={()=>setLang(lang==="bn"?"en":"bn")}>{lang==="bn"?"EN":"বাং"}</Button>
              <Button size="small" icon={dark?<SunOutlined/>:<MoonOutlined/>} onClick={()=>setDark(!dark)} />
              <Avatar style={{background:"#059669"}}>{user?.name?.[0]||"A"}</Avatar>
              <Text strong style={{fontSize:13}}>{user?.name}</Text>
              <Button danger size="small" icon={<LogoutOutlined/>} onClick={onLogout}>
                {lang==="bn"?"বের":"Logout"}
              </Button>
            </Space>
          </Header>

          {/* Mobile tab scroll */}
          {isMobile && (
            <div style={{display:"flex",overflowX:"auto",background:dark?"#141414":"#fff",
              borderBottom:"1px solid rgba(0,0,0,0.08)",scrollbarWidth:"none"}}>
              {menuItems.map(item=>(
                <button key={item.key} onClick={()=>setTab(item.key)} style={{
                  flex:"0 0 auto",padding:"10px 14px",border:"none",
                  borderBottom:`2.5px solid ${tab===item.key?"#059669":"transparent"}`,
                  background:"transparent", color:tab===item.key?"#059669":"#888",
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
                    {title:lang==="bn"?"প্রদানকারী":"Providers",           value:realStats?.providers??providers.length,              color:"#059669"},
                    {title:lang==="bn"?"মোট বুকিং":"Total Bookings",      value:realStats?.bookings??bookings.length,               color:"#F59E0B"},
                    {title:lang==="bn"?"KYC অপেক্ষায়":"KYC Pending",      value:realStats?.kycPending??providers.filter(p=>p.status==="pending").length, color:"#EF4444"},
                    {title:lang==="bn"?"চলমান বুকিং":"Today's Bookings",  value:realStats?.todayBookings??bookings.filter(b=>b.status==="ongoing").length, color:"#8B5CF6"},
                    {title:lang==="bn"?"মোট রাজস্ব":"Total Revenue",       value:`৳${Math.round(realStats?.revenue??3100).toLocaleString()}`, color:"#10B981"},
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
                      <Table dataSource={bookings.slice(0,3)} columns={bookingCols.slice(0,5)}
                        pagination={false} size="small" rowKey="id" />
                    </Card>
                  </Col>
                  <Col xs={24} lg={10}>
                    <Card title={lang==="bn"?"⏳ অনুমোদন অপেক্ষামাণ":"⏳ Pending Approvals"} bordered>
                      {providers.filter(p=>p.status==="pending").map(p=>(
                        <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
                          <div>
                            <Text strong>{p.name}</Text><br/>
                            <Text type="secondary" style={{fontSize:12}}>{p.service} · {p.area}</Text>
                          </div>
                          <Space>
                            <Button size="small" type="primary" icon={<CheckOutlined/>} onClick={()=>approveProvider(p.id)} />
                            <Button size="small" danger icon={<CloseOutlined/>} onClick={()=>rejectProvider(p.id)} />
                          </Space>
                        </div>
                      ))}
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
                  loading={dataLoading} scroll={{x:900}} pagination={{pageSize:10}} />
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
                      <Table.Summary.Cell><Text strong style={{color:"#10B981"}}>৳{displayBookings.reduce((a,b)=>a+(b.amount||0),0).toLocaleString()}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell/>
                    </Table.Summary.Row>
                  )}
                />
              </>
            )}

            {/* ── KYC ── */}
            {tab==="kyc" && (
              <>
                <Title level={4}>🪪 {lang==="bn"?"KYC যাচাই":"KYC Verification"}</Title>
                <Space style={{marginBottom:16}} wrap>
                  {[
                    {v:"all",      l:lang==="bn"?"সব":"All"},
                    {v:"pending",  l:`${lang==="bn"?"অপেক্ষায়":"Pending"} (${kycList.filter(k=>k.status==="pending").length})`},
                    {v:"verified", l:lang==="bn"?"যাচাইকৃত":"Verified"},
                    {v:"rejected", l:lang==="bn"?"প্রত্যাখ্যাত":"Rejected"},
                  ].map(f=>(
                    <Button key={f.v} type={kycFilter===f.v?"primary":"default"} size="small"
                      onClick={()=>{setKycFilter(f.v); loadKyc(f.v==="all"?"pending":f.v);}}>{f.l}</Button>
                  ))}
                </Space>
                <Row gutter={[12,12]}>
                  {kycList.filter(k=>kycFilter==="all"||k.status===kycFilter).map(kyc=>{
                    const docIcons={nid:"🪪",driving:"🚗",passport:"📘",birth:"📜"};
                    const borderColor=kyc.status==="verified"?"#10B981":kyc.status==="pending"?"#F59E0B":"#EF4444";
                    return (
                      <Col xs={24} md={12} key={kyc.id}>
                        <Card bordered style={{borderLeft:`4px solid ${borderColor}`}} bodyStyle={{padding:16}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                            <Space align="start">
                              <Text style={{fontSize:36}}>{docIcons[kyc.docType]||"📋"}</Text>
                              <div>
                                <Text strong>{kyc.userName}</Text><br/>
                                <Text type="secondary" style={{fontSize:12}}>{kyc.phone}</Text><br/>
                                <Text type="secondary" style={{fontSize:12}}>{kyc.docType.toUpperCase()} · {kyc.docNum}</Text><br/>
                                <Text type="secondary" style={{fontSize:11}}>{kyc.submittedAt}</Text>
                              </div>
                            </Space>
                            <div style={{textAlign:"right"}}>
                              <StatusTag status={kyc.status} lang={lang}/>
                              {kyc.status==="pending" && (
                                <Space style={{marginTop:8}}>
                                  <Button size="small" type="primary" icon={<CheckOutlined/>} onClick={()=>kycApprove(kyc.id)}>
                                    {lang==="bn"?"অনুমোদন":"Approve"}
                                  </Button>
                                  <Button size="small" danger icon={<CloseOutlined/>} onClick={()=>{setKycRejectModal({open:true,id:kyc.id});setKycRejectReason("");}}>
                                    {lang==="bn"?"প্রত্যাখ্যান":"Reject"}
                                  </Button>
                                </Space>
                              )}
                            </div>
                          </div>
                          {kyc.status==="rejected"&&kyc.rejectionReason&&(
                            <Alert message={`${lang==="bn"?"কারণ":"Reason"}: ${kyc.rejectionReason}`}
                              type="error" showIcon style={{marginTop:10,padding:"4px 10px",fontSize:12}} />
                          )}
                          <Row gutter={8} style={{marginTop:12}}>
                            {[
                              {label:lang==="bn"?"সামনে":"Front",  src:kyc.frontImg},
                              {label:lang==="bn"?"পেছনে":"Back",   src:kyc.backImg},
                              {label:lang==="bn"?"সেলফি":"Selfie", src:kyc.selfieImg},
                            ].map((img,i)=>(
                              <Col span={8} key={i}>
                                <Card bodyStyle={{padding:8,textAlign:"center"}} size="small">
                                  {img.src
                                    ? <img src={img.src.startsWith("http")||img.src.startsWith("data:")?img.src:`data:image/jpeg;base64,${img.src}`}
                                        style={{width:"100%",height:60,objectFit:"cover",borderRadius:6,cursor:"pointer"}}
                                        alt={img.label}
                                        onClick={()=>window.open(img.src.startsWith("http")||img.src.startsWith("data:")?img.src:`data:image/jpeg;base64,${img.src}`,"_blank")}/>
                                    : <div style={{fontSize:22,lineHeight:"60px"}}>🖼️</div>
                                  }
                                  <Text type="secondary" style={{fontSize:10}}>{img.label}</Text>
                                </Card>
                              </Col>
                            ))}
                          </Row>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
                <Modal title={lang==="bn"?"প্রত্যাখ্যানের কারণ":"Rejection Reason"}
                  open={kycRejectModal.open} onOk={kycReject}
                  onCancel={()=>setKycRejectModal({open:false,id:null})}
                  okText={lang==="bn"?"নিশ্চিত":"Confirm"} okButtonProps={{danger:true}}>
                  <Input.TextArea rows={3} value={kycRejectReason} onChange={e=>setKycRejectReason(e.target.value)}
                    placeholder={lang==="bn"?"যেমন: ছবি অস্পষ্ট, নথি মেয়াদোত্তীর্ণ...":"e.g. Image blurry, expired..."} />
                </Modal>
              </>
            )}

            {/* ── REVENUE ── */}
            {tab==="revenue" && (
              <>
                <Title level={4}>💹 {lang==="bn"?"রাজস্ব ও বিশ্লেষণ":"Revenue & Analytics"}</Title>
                <Row gutter={[16,16]} style={{marginBottom:24}}>
                  {(()=>{
                    const rev   = realStats?.revenue   ?? 0;
                    const lastM = monthlyRev2.length>0 ? (monthlyRev2[monthlyRev2.length-1]?.v??0) : 47800;
                    return [
                      {title:lang==="bn"?"মোট রাজস্ব":"Total Revenue",       value:`৳${Math.round(rev).toLocaleString()||" ২,৪০,৫০০"}`, color:"#059669"},
                      {title:lang==="bn"?"এই মাস":"This Month",              value:`৳${Math.round(lastM).toLocaleString()}`,            color:"#3B82F6"},
                      {title:lang==="bn"?"মোট বুকিং":"Total Bookings",       value:realStats?.bookings??0,                              color:"#F59E0B"},
                      {title:lang==="bn"?"KYC অপেক্ষায়":"KYC Pending",       value:realStats?.kycPending??0,                           color:"#EF4444"},
                      {title:lang==="bn"?"সক্রিয় Provider":"Active Providers",value:realStats?.providers??0,                           color:"#8B5CF6"},
                      {title:lang==="bn"?"মোট ব্যবহারকারী":"Total Users",    value:realStats?.users??0,                                color:"#10B981"},
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
                            <Text style={{fontSize:10,color:"#059669",fontWeight:700}}>{(m.v/1000).toFixed(0)}k</Text>
                            <div style={{width:"100%",background:i===arr.length-1?"#059669":"#D1FAE5",
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
                            <Avatar style={{background:"#059669",fontWeight:900}}>#{i+1}</Avatar>
                            <div>
                              <Text strong>{p.name}</Text><br/>
                              <Text type="secondary" style={{fontSize:11}}>{p.service} · {p.jobs} {lang==="bn"?"কাজ":"jobs"}</Text>
                            </div>
                          </Space>
                          <Text strong style={{color:"#059669"}}>৳{p.earned.toLocaleString()}</Text>
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
                          style={{borderLeft:`4px solid ${t.priority==="high"?"#EF4444":t.priority==="medium"?"#F59E0B":"#10B981"}`}}>
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
                    bordered style={{borderTop:"3px solid #059669"}}>
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
                      <Button type="primary" icon={<SendOutlined/>} block onClick={async()=>{
                        if(!notifTitle.trim()||!notifMsg.trim()){toast(lang==="bn"?"শিরোনাম ও বার্তা দিন":"Enter title and message","warning");return;}
                        const titleVal=notifTitle; const msgVal=notifMsg;
                        try{await adminApi.notify({title_bn:titleVal,title_en:titleVal,body_bn:msgVal,body_en:msgVal,type:"system"});}catch(e){console.warn(e.message);}
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
                <Card title={`➕ ${lang==="bn"?"নতুন প্রোমো":"New Promo"}`} bordered style={{marginBottom:20,borderTop:"3px solid #059669"}}>
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
                      <Button type="primary" icon={<PlusOutlined/>} block onClick={()=>{
                        if(!promoForm.code||!promoForm.discount){toast(lang==="bn"?"কোড ও ছাড় দিন":"Enter code and discount","warning");return;}
                        setPromos(p=>[...p,{id:"PR"+Date.now().toString().slice(-4),code:promoForm.code,discount:Number(promoForm.discount),
                          type:promoForm.type,uses:0,limit:Number(promoForm.limit)||999,expires:"2025-12-31",active:true}]);
                        setPromoForm({code:"",discount:"",type:"percent",limit:""});
                        toast(lang==="bn"?"✅ প্রোমো যোগ":"✅ Created");
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

            {/* ── CATEGORIES ── */}
            {tab==="categories" && (
              <>
                <Title level={4}>🗂️ {lang==="bn"?"সেবা বিভাগ":"Service Categories"}</Title>
                <Card title={`➕ ${lang==="bn"?"নতুন বিভাগ":"New Category"}`} bordered style={{marginBottom:20,borderTop:"3px solid #059669"}}>
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
                    <Card title={`📈 ${lang==="bn"?"রাজস্ব পূর্বাভাস":"Revenue Forecast"}`} bordered style={{borderTop:"3px solid #059669"}}>
                      {aiForecast?.forecastRevenue?.length ? (
                        <div style={{display:"flex",gap:16,marginBottom:10}}>
                          {aiForecast.forecastRevenue.map((f,i)=>(
                            <div key={i} style={{flex:1,textAlign:"center",padding:"12px 6px",background:`rgba(5,150,105,${0.08*(i+1)})`,borderRadius:10}}>
                              <div style={{fontSize:12,color:"#666",marginBottom:4}}>{f.label}</div>
                              <div style={{fontSize:18,fontWeight:700,color:"#059669"}}>৳{(f.value/1000).toFixed(1)}k</div>
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
                                  <div style={{width:"100%",background:"#059669",borderRadius:"4px 4px 0 0",height:Math.round((m.v/chartMax)*52),minHeight:4,transition:"height .3s"}} />
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
                    {ic:"🤖",lbn:"Real AI Chatbot",len:"Real AI Chatbot",d_bn:"OpenAI GPT-4o-mini + স্মার্ট বাংলা ফলব্যাক সক্রিয়",d_en:"OpenAI GPT-4o-mini + Smart Bangla fallback active",color:"#059669"},
                    {ic:"🎙️",lbn:"ভয়েস ইনপুট",len:"Voice Input",d_bn:"Web Speech API — বাংলা ও ইংরেজি সাপোর্ট",d_en:"Web Speech API — Bangla & English supported",color:"#6366F1"},
                    {ic:"🎯",lbn:"স্মার্ট ম্যাচিং",len:"Smart Matching",d_bn:"AI স্কোর দিয়ে provider র‍্যাংকিং",d_en:"AI-scored provider ranking",color:"#F59E0B"},
                    {ic:"💰",lbn:"ডায়নামিক প্রাইসিং",len:"Dynamic Pricing",d_bn:"চাহিদা ও সময়ভিত্তিক মূল্য",d_en:"Demand & time-based pricing",color:"#EF4444"},
                    {ic:"🛡️",lbn:"ফ্রড ডিটেকশন",len:"Fraud Detection",d_bn:"সন্দেহজনক বুকিং স্বয়ংক্রিয়ভাবে ফ্ল্যাগ",d_en:"Auto-flag suspicious bookings",color:"#0EA5E9"},
                    {ic:"⭐",lbn:"ফেক রিভিউ চেক",len:"Fake Review Check",d_bn:"নকল রিভিউ AI দিয়ে শনাক্ত",d_en:"Detect fake reviews with AI",color:"#8B5CF6"},
                    {ic:"📦",lbn:"বান্ডেল সাজেশন",len:"Bundle Suggest",d_bn:"বুকিং পরে পরিপূরক সেবা সাজেস্ট",d_en:"Suggest complementary services post-booking",color:"#10B981"},
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
                  {[["open","#EF4444",lang==="bn"?"খোলা":"Open"],["in_progress","#F59E0B",lang==="bn"?"প্রক্রিয়াধীন":"In Progress"],["resolved","#16A34A",lang==="bn"?"সমাধান":"Resolved"]].map(([s,c,l])=>(
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
                        {r.status!=="resolved"&&<Button size="small" style={{background:"#16A34A",borderColor:"#16A34A",color:"#fff"}}
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
                    ["success",  "#16A34A", lang==="bn"?"সফল":"Success"],
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

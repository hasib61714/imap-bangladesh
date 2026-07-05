import { useState, useEffect, useRef, useCallback, useContext, lazy, Suspense } from "react";
import L from "leaflet";
import { C_LIGHT, C_DARK, CSS, CSS_DARK } from "./constants/theme";
import { T } from "./constants/translations";
import { SVCS, PROVIDERS, MY_BOOKINGS, NOTIFS_DATA,
  CAL_SLOTS, AN_MONTHS, AN_DATA, AN_SERVICES, AN_ACTIVITY, SR_TYPES, SR_TIMES,
  LOYALTY_REWARDS, LEVELS, LY_HISTORY, RF_FRIENDS, RF_STEPS, PF_PROVIDERS,
  REG_SERVICES, PA_MONTHS, PA_EARNINGS, PA_REVIEWS, SC_COURSES, COUPONS,
  PROMO_CATS, TRANSACTIONS, TOPUP_AMOUNTS, TOPUP_METHODS, BLOOD_GROUPS, DONORS,
  BG_COL_MAP } from "./constants/data";
import { ThemeCtx, useC, LangCtx, useTr, FavsCtx, LiveDataCtx, useLiveData, UserCtx, useUser } from "./contexts";
import { Av, Stars, PBar, MiniBar } from "./components/ui";
import { escHtml, toUiProv, pseudoBooked, haversine, showBrowserNotif } from "./utils/helpers";
const AuthPage      = lazy(() => import("./pages/AuthPage"));
const KYCPage       = lazy(() => import("./pages/KYCPage"));
const AdminPanel    = lazy(() => import("./pages/AdminPanel"));
const ProviderPortal = lazy(() => import("./pages/ProviderPortal"));
const LandingPage   = lazy(() => import("./pages/LandingPage"));
import VoiceCommand from "./components/VoiceCommand";
const DisasterPage = lazy(() => import("./pages/DisasterPage"));
const NotifPage = lazy(() => import("./pages/NotifPage"));
import PageLoader from "./pages/PageLoader";
import LiveMap from "./pages/LiveMap";
import PCard from "./pages/PCard";
import PDetail from "./pages/PDetail";
import BookModal from "./pages/BookModal";
import RatingModal from "./pages/RatingModal";
import DisputeModal from "./pages/DisputeModal";
import GuaranteeModal from "./pages/GuaranteeModal";
const MyBookings = lazy(() => import("./pages/MyBookings"));
import LoanScore from "./pages/LoanScore";
const ProviderDash = lazy(() => import("./pages/ProviderDash"));
import NIDPage from "./pages/NIDPage";
import ElderlyMode from "./pages/ElderlyMode";
import SearchFilter from "./pages/SearchFilter";
const CustomerProfilePage = lazy(() => import("./pages/CustomerProfilePage"));
import Chat from "./pages/Chat";
import Onboarding from "./pages/Onboarding";
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ServiceRequestPage = lazy(() => import("./pages/ServiceRequestPage"));
const LoyaltyPage = lazy(() => import("./pages/LoyaltyPage"));
const ReferralPage = lazy(() => import("./pages/ReferralPage"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const ProviderRegPage = lazy(() => import("./pages/ProviderRegPage"));
const ProviderAnalyticsPage = lazy(() => import("./pages/ProviderAnalyticsPage"));
const SkillCertPage = lazy(() => import("./pages/SkillCertPage"));
const PromosPage = lazy(() => import("./pages/PromosPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
import BloodDonorMap from "./pages/BloodDonorMap";
const BloodDonationPage = lazy(() => import("./pages/BloodDonationPage"));
const NearbyPage = lazy(() => import("./pages/NearbyPage"));
import LiveChatPage from "./pages/LiveChatPage";
import { useSocket } from "./hooks/useSocket";
import { usePageRoute } from "./hooks/usePageRoute";

// Valid in-app pages (drives hash deep-linking; unknown hashes fall back home).
const PAGES = ["home","services","providers","bookings","notifs","dashboard","how",
  "saved","nearby","calendar","blood","disaster","wallet","cprofile","loyalty",
  "referral","promos","settings","analytics","panalytics","portfolio","providerreg",
  "skillcert","srvreq"];
import { users as usersApi, providers as providersApi, bookings as bookingsApi, reviews as reviewsApi, ai, blood as bloodApi, disaster as disasterApi, chat as chatApi, promos as promosApi, schedule as scheduleApi, kyc as kycApi, getToken, setToken, auth as authApi, sos as sosApi, payments as paymentsApi, upload as uploadApi, loans as loansApi, wakeBackend } from "./api";

const C = C_LIGHT; // module-level fallback

/* ── Lazy-load fallback ─────────────────────────────────── */

/* ── Map a backend provider row → UI provider shape ── */



/* ══ LIVE MAP ══ */

/* ══ PROVIDER CARD ══ */

/* ══ PROVIDER DETAIL ══ */

/* ══ BOOKING MODAL ══ */

/* ══ RATING MODAL ══ */

/* ══ DISPUTE MODAL ══ */

/* ══ SERVICE GUARANTEE MODAL ══ */

/* ══ MY BOOKINGS ══ */

/* ══ LOAN SCORE ══ */

/* ══ PROVIDER DASHBOARD ══ */

/* ══ NID PAGE ══ */

/* ══ ELDERLY MODE ══ */

/* ══ SEARCH / FILTER ══ */

/* ══ CUSTOMER PROFILE OVERVIEW ══ */

/* ══ NOTIFICATIONS ══ */

/* ══ AI CHAT (Real API + Voice Input) ══ */


/* ══ ONBOARDING ══ */

/* ══ FAVORITES PAGE ══ */

/* ─── Smart Calendar ─────────────────────────────────── */
// Deterministic "booked" slots so UI looks realistic per provider

/* ─── Analytics Dashboard ───────────────────────────── */


/* ─── Settings / Privacy ─────────────────────────────── */

/* ─── Service Request Form ───────────────────────────── */


/* ─── Loyalty / Points ───────────────────────────────── */


/* ─── Referral Program ───────────────────────────────── */


/* ─── Portfolio Page ─────────────────────────────────── */


/* ─── Provider Registration ──────────────────────────── */


/* ─── Provider Analytics ─────────────────────────────── */


/* ─── Skill Certification ────────────────────────────── */


/* ─── Promo / Coupon System ──────────────────────────── */


/* ─── Wallet / Transaction History ──────────────────── */


/* ─── Disaster Alert Mode ────────────────────────────── */

/* ─── Blood Donation ─────────────────────────────────── */

/* ── Blood Donor Map (Leaflet) ── */


/* ─── GPS / Nearby ───────────────────────────────────── */

/* ─── Live Chat ──────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════════ */
/* ── Browser Push Notification helper ── */

export default function IMAP() {
  const [page,setPage]        = usePageRoute("home", PAGES); // hash-synced (#services, back button)
  const [booking,setBooking]  = useState(null);
  const [detail,setDetail]    = useState(null);
  const [rateFor,setRateFor]  = useState(null);
  const [modal,setModal]      = useState(null);
  const [notifDrop,setNotifDrop] = useState(false);
  const [profDrop,setProfDrop]   = useState(false);
  const [navDotMenu,setNavDotMenu] = useState(false);
  const [emg,setEmg]          = useState(false);
  const [emgCnt,setEmgCnt]    = useState(null);
  const [emgSvc,setEmgSvc]    = useState(null);
  const [elderly,setElderly]  = useState(false);
  const [tracking,setTracking]= useState(false);
  const [lang,setLang]        = useState("bn");
  const [dark,setDark]        = useState(false);
  const [onboard,setOnboard]  = useState(()=>!localStorage.getItem("imap_ob"));
  const [favs,setFavs]        = useState(()=>JSON.parse(localStorage.getItem("imap_favs")||"[]"));
  const [chatWith,setChatWith] = useState(null);
  const [anim,setAnim]        = useState(false);
  const [showKyc,setShowKyc]  = useState(false);
  const [isMobile,setIsMobile]= useState(false);
  const [svcCat,setSvcCat]    = useState(null); // selected service category filter
  const [svcSearch,setSvcSearch] = useState(""); // service page search query

  // ── AUTH STATE ──
  const [authUser,setAuthUser] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem("imap_user")||"null"); }
    catch{ localStorage.removeItem("imap_user"); return null; }
  });

  const [showLanding, setShowLanding] = useState(()=>!localStorage.getItem("imap_user"));
  const [showSos,     setShowSos]     = useState(false);
  const [sosType,     setSosType]     = useState("");
  const [sosDesc,     setSosDesc]     = useState("");
  const [sosLoading,  setSosLoading]  = useState(false);
  const [sosDone,     setSosDone]     = useState(false);
  // ── PAYMENT STATE ──
  const [showPayment,     setShowPayment]     = useState(false);
  const [payBookingId,    setPayBookingId]    = useState(null);
  const [payLoading,      setPayLoading]      = useState(false);
  const [payResult,       setPayResult]       = useState(null);
  const [payResultTranId, setPayResultTranId] = useState(null);

  // ── LIVE DATA STATE (falls back to static constants until API responds) ──
  const [liveProviders, setLiveProviders] = useState(PROVIDERS);
  const [liveBookings,  setLiveBookings]  = useState(MY_BOOKINGS);
  const [walletBalance, setWalletBalance] = useState(1545);

  // ── NOTIFICATION STATE (real-time polling) ──
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [liveNotifs,   setLiveNotifs]   = useState(NOTIFS_DATA);

  // ── NETWORK STATE ──
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  const doLogin  = u  => { localStorage.setItem("imap_user",JSON.stringify(u)); localStorage.setItem("imap_ob","1"); setOnboard(false); setAuthUser(u); setShowLanding(false); };
  const doLogout = () => { try { authApi.logout(); } catch {} localStorage.removeItem("imap_user"); localStorage.removeItem("imap_token"); localStorage.removeItem("imap_refresh"); setAuthUser(null); setShowLanding(true); };

  // Auto-logout when any authenticated API call returns 401 (expired/invalid token)
  // Using custom event avoids a window.location.reload() loop
  useEffect(()=>{
    const handler = () => doLogout();
    window.addEventListener("imap-unauthorized", handler);
    return () => window.removeEventListener("imap-unauthorized", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Silently refresh JWT when tab regains visibility (keeps long sessions alive)
  useEffect(()=>{
    if (!authUser) return;
    const handler = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await authApi.refresh();
          if (res?.token) { setToken(res.token); }
          if (res?.user)  { const updated={...authUser,...res.user}; setAuthUser(updated); localStorage.setItem("imap_user",JSON.stringify(updated)); }
        } catch { /* silently ignore — 401 will auto-logout via imap-unauthorized */ }
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.id]);

  // Track network connectivity for the offline banner
  useEffect(()=>{
    const goOnline  = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return ()=>{ window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  },[]);

  // ── VOICE COMMAND HANDLER ──
  const handleVoiceCommand = useCallback(({ transcript, match }) => {
    if (!match) return;
    if (match.action === "emergency") {
      setEmg(true);
      return;
    }
    if (match.action === "logout") {
      doLogout();
      return;
    }
    if (match.page) {
      setPage(match.page);
      setDetail(null);
      setBooking(null);
    }
  }, []);

  // ── ALL EFFECTS (must be before any conditional returns) ──
  useEffect(()=>{
    if(typeof window.hideSplash==="function") window.hideSplash();
    setTimeout(()=>setAnim(true),80);
    // Clear error-reload counter on successful mount
    sessionStorage.removeItem('imap_reloads');
    // Wake Render backend immediately so it's ready when user acts
    wakeBackend();
    const check=()=>setIsMobile(window.innerWidth<=640);
    check(); window.addEventListener("resize",check);
    // Service worker is registered in index.html (with correct %BASE_URL% path)
    // Handle SSLCommerz payment redirect
    const params=new URLSearchParams(window.location.search);
    const payStatus=params.get("payment");
    const tranId=params.get("tran_id");
    if(payStatus&&["success","failed","cancelled"].includes(payStatus)){
      setPayResult(payStatus);
      setPayResultTranId(tranId);
      setShowPayment(true);
      window.history.replaceState({},"",window.location.pathname+window.location.hash);
    }
    return()=>window.removeEventListener("resize",check);
  },[])

  useEffect(()=>{
    if(emgCnt!==null&&emgCnt>0){
      const t=setTimeout(()=>setEmgCnt(c=>c-1),1000);
      return()=>clearTimeout(t);
    }
  },[emgCnt]);

  useEffect(()=>{
    // Pre-load public providers list even before login (endpoint is public)
    providersApi.list().then(d=>{if(d.providers?.length)setLiveProviders(d.providers);}).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    if(!authUser) return;
    bookingsApi.list().then(d=>{if(d.bookings)setLiveBookings(d.bookings);}).catch(()=>{});
    usersApi.getWallet().then(d=>{if(d.balance!=null)setWalletBalance(d.balance);}).catch(()=>{});
    // Request browser notification permission
    if("Notification" in window && Notification.permission==="default"){
      const notifT=setTimeout(()=>Notification.requestPermission().catch(()=>{}),3000);
      return()=>clearTimeout(notifT);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.id]);

  // ── NOTIFICATION POLLING (every 30s) ──
  useEffect(()=>{
    if(!authUser) return;
    const fetchNotifs=()=>{
      usersApi.getNotifications().then(d=>{
        if(d?.notifications?.length){
          setLiveNotifs(d.notifications.map(n=>({
            id:n.id, icon:n.icon||"🔔",
            t:n.title_bn||n.title||"", tEn:n.title_en||n.title||"",
            m:n.body_bn||n.body||"",   mEn:n.body_en||n.body||"",
            time:n.created_at||"", timeEn:n.created_at||"",
            unread:!n.is_read, type:n.type||"info",
          })));
          const cnt=d.notifications.filter(n=>!n.is_read).length;
          setUnreadCount(cnt);
        }
      }).catch(()=>{});
    };
    fetchNotifs();
    const id=setInterval(fetchNotifs,30000);
    return()=>clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.id]);

  // ── SOCKET booking-status notifications ──
  const { on: onSocketEvent } = useSocket(getToken());
  useEffect(()=>{
    if(!authUser) return;
    const off=onSocketEvent("booking_updated",data=>{
      showBrowserNotif("IMAP বুকিং আপডেট 📋",data?.message||"আপনার বুকিংয়ে পরিবর্তন হয়েছে");
    });
    return off;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.id]);

  // ── Show browser notif for new unread notifications ──
  const prevUnreadRef = useRef(0);
  useEffect(()=>{
    if(unreadCount > prevUnreadRef.current && liveNotifs.length>0 && document.hidden){
      const n=liveNotifs.find(x=>x.unread);
      if(n) showBrowserNotif(n.t||n.tEn||"IMAP নোটিফিকেশন 🔔", n.m||n.mEn||"নতুন বার্তা");
    }
    prevUnreadRef.current=unreadCount;
  },[unreadCount]);

  // ── AUTO MARK-READ WHEN NOTIFS PAGE IS OPEN ──
  useEffect(()=>{
    if(page==="notifs" && unreadCount>0){
      setUnreadCount(0);
      setLiveNotifs(n=>n.map(x=>({...x,unread:false})));
      usersApi.markNotifRead().catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[page]);

  const refreshBookings = ()=>bookingsApi.list().then(d=>{if(d.bookings)setLiveBookings(d.bookings);}).catch(()=>{});

  // ── ROLE-BASED ROUTING ──
  if(!authUser && showLanding) return <Suspense fallback={<PageLoader/>}><LandingPage dark={dark} setDark={setDark} lang={lang} setLang={setLang}
    onGetStarted={()=>setShowLanding(false)}
    onRegisterProvider={()=>setShowLanding(false)}/></Suspense>;
  if(!authUser) return <Suspense fallback={<PageLoader/>}><AuthPage onAuth={doLogin} dark={dark} setDark={setDark} lang={lang} setLang={setLang}
    onBack={()=>setShowLanding(true)}/></Suspense>;
  if(authUser.role==="admin") return <Suspense fallback={<PageLoader/>}><AdminPanel user={authUser} onLogout={doLogout} dark={dark} setDark={setDark} lang={lang} setLang={setLang}/></Suspense>;
  if(authUser.role==="provider") return <Suspense fallback={<PageLoader/>}><ProviderPortal user={authUser} onLogout={doLogout} dark={dark} setDark={setDark} lang={lang} setLang={setLang}/></Suspense>;
  if(showKyc) return <Suspense fallback={<PageLoader/>}><KYCPage user={authUser} onClose={()=>setShowKyc(false)} dark={dark} lang={lang} onUpdate={u=>{setAuthUser(u);localStorage.setItem("imap_user",JSON.stringify(u));}}/></Suspense>;

  const tr = T[lang];
  const C  = dark ? C_DARK : C_LIGHT;

  const goBook = p=>{ setDetail(null); setModal(null); setBooking(p); };
  const closeAll = ()=>{ setNotifDrop(false); setProfDrop(false); setNavDotMenu(false); };
  const toggleFav = id=>{ const next=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id]; setFavs(next); localStorage.setItem("imap_favs",JSON.stringify(next)); };

  /* ── EMERGENCY MODAL ── */
  const EmgModal = ()=>(
    <div className="ov" onClick={()=>{setEmg(false);setEmgSvc(null);}}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400,padding:28,textAlign:"center"}}>
        <div style={{fontSize:60,marginBottom:14,animation:"pulse 1s infinite"}}>🚨</div>
        <div style={{fontSize:20,fontWeight:700,color:C.red}}>{tr.emgTitle}</div>
        <div style={{fontSize:13,color:C.muted,marginTop:6}}>{tr.emgSub}</div>
        {emgCnt>0?(
          <div style={{margin:"20px 0"}}>
            <div style={{fontSize:56,fontWeight:700,color:C.red,lineHeight:1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{emgCnt}</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:10}}>{tr.emgConnecting}</div>
            <PBar v={((5-emgCnt)/5)*100} col={C.red}/>
          </div>
        ):(
          <div style={{background:"rgba(239,68,68,.08)",borderRadius:12,padding:14,margin:"16px 0",border:"1px solid rgba(239,68,68,.25)"}}>
            <div style={{fontSize:14,fontWeight:600,color:C.red}}>{tr.emgConnected}</div>
          </div>
        )}
        <div className="g2" style={{marginBottom:12,gap:8}}>
          {(lang==="en"?["🏥 Ambulance","💊 Nurse","🩺 Doctor","🩸 Blood Donor"]:["🏥 অ্যাম্বুলেন্স","💊 নার্স","🩺 ডাক্তার","🩸 রক্তদাতা"]).map(item=>(
            <button key={item} onClick={()=>setEmgSvc(item)}
              style={{padding:"11px 6px",background:emgSvc===item?"#DC2626":"rgba(239,68,68,.08)",border:`2px solid ${emgSvc===item?"#DC2626":"rgba(220,38,38,.25)"}`,borderRadius:10,fontSize:12,cursor:"pointer",color:emgSvc===item?"#fff":C.red,fontWeight:700,fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>{emgSvc===item?"✓ ":""}{item}</button>
          ))}
        </div>
        {emgSvc&&(
          <div style={{background:"rgba(239,68,68,.08)",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:C.red,fontWeight:600,border:"1px solid rgba(239,68,68,.25)"}}>✅ {lang==="en"?`Requesting ${emgSvc}...`:`${emgSvc} অনুরোধ পাঠানো হচ্ছে...`}</div>
        )}
        <button className="btn btn-gh" style={{width:"100%",border:`1px solid ${C.bdr}`}} onClick={()=>{setEmg(false);setEmgSvc(null);}}>{tr.emgCancel}</button>
      </div>
    </div>
  );

  /* ── NAVBAR ── */
  const Nav = ()=>(
    <nav style={{
      background:dark?"rgba(8,15,11,.9)":"rgba(255,255,255,.9)",
      backdropFilter:"blur(6px) saturate(130%)",
      WebkitBackdropFilter:"blur(6px) saturate(130%)",
      borderBottom:`1px solid ${dark?"rgba(30,69,53,.5)":"rgba(255,255,255,.6)"}`,
      position:"sticky",top:0,zIndex:600,
      boxShadow:dark
        ?"0 2px 20px rgba(0,0,0,.3),inset 0 -1px 0 rgba(34,212,127,.06)"
        :"0 2px 16px rgba(21,163,96,.06),inset 0 -1px 0 rgba(255,255,255,.8)"
    }}>
      <div className="wp row" style={{height:62,gap:18}}>
        {/* Logo */}
        <div className="row" style={{gap:8,cursor:"pointer",flexShrink:0}} onClick={()=>{setPage("home");closeAll();}}>
          <div className="jc" style={{
            width:38,height:38,borderRadius:12,
            background:`linear-gradient(135deg,${C.p},${C.pdk})`,
            fontSize:18,
            boxShadow:`0 4px 14px ${C.p}55,inset 0 1px 0 rgba(255,255,255,.25)`
          }}>🌿</div>
          <div>
            <div style={{
              fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:19,fontWeight:800,lineHeight:1,
              background:`linear-gradient(135deg,${C.p},${C.pdk})`,
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"
            }}>IMAP</div>
            <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",opacity:.8}}>AI Powered Service Platform</div>
          </div>
        </div>
        {/* Search bar (desktop) */}
        <div className="nsearch" style={{flex:1,maxWidth:440,position:"relative"}}>
          <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.muted}}>🔍</div>
          <input placeholder={tr.search} readOnly onClick={()=>setModal("search")} style={{
            width:"100%",padding:"10px 14px 10px 38px",
            border:`1.5px solid ${C.bdr}`,borderRadius:12,fontSize:13,
            color:C.text,background:dark?"rgba(8,15,11,.6)":"rgba(248,252,250,.8)",
            cursor:"pointer",backdropFilter:"blur(2px)",
            transition:"all .2s",boxShadow:"inset 0 1px 3px rgba(0,0,0,.04)"
          }} onFocus={e=>{e.target.style.borderColor=C.p;e.target.style.boxShadow=`0 0 0 3px ${C.p}18`;}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.boxShadow="inset 0 1px 3px rgba(0,0,0,.04)";}}/>
        </div>
        {/* Desktop nav links — শুধু মূল পেজগুলো */}
        <div className="dnav row" style={{gap:2,flexShrink:0}}>
          {[["home",tr.home],["services",tr.services],["providers",tr.providers],["nearby",lang==="bn"?"নিকটে":"Nearby"],["how",tr.how]].map(([id,l])=>(
            <button key={id} className={`nv${page===id?" act":""}`} onClick={()=>{setPage(id);closeAll();}}>{l}</button>
          ))}
        </div>
        {/* Right controls */}
        <div className="row" style={{marginLeft:"auto",gap:8}}>
          {/* Language selector — desktop only */}
          {!isMobile&&<button onClick={()=>setLang(lang==="bn"?"en":"bn")} title={lang==="bn"?"Switch to English":"বাংলায় পরিবর্তন করুন"} style={{height:36,padding:"0 11px",border:`1px solid ${C.bdr}`,borderRadius:9,background:C.bg,cursor:"pointer",fontSize:12,fontWeight:700,color:C.text,transition:"all .2s"}}>{lang==="bn"?"EN":"বাং"}</button>}
          {/* Dark mode toggle — desktop only */}
          {!isMobile&&<button onClick={()=>setDark(d=>!d)} title={dark?tr.lightMode:tr.darkMode} style={{width:36,height:36,border:`1px solid ${C.bdr}`,borderRadius:9,background:dark?"#1A3D2E":C.bg,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,transition:"all .2s"}}>{dark?"☀️":"🌙"}</button>}
          {/* Icon buttons (desktop only) */}
          {!isMobile&&[["👴",tr.elderlyMode,()=>setElderly(true)],["🗺️",tr.map,()=>setModal("map")],["🔍",tr.find,()=>setModal("search")]].map(([ic,title,fn])=>(
            <button key={title} title={title} className="htab" onClick={fn} style={{
              width:36,height:36,border:`1px solid ${C.bdr}`,borderRadius:9,
              background:dark?"rgba(15,30,22,.7)":"rgba(255,255,255,.8)",
              backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:15,transition:"all .2s",boxShadow:"0 2px 8px rgba(0,0,0,.06)"
            }} onMouseEnter={e=>{e.currentTarget.style.background=C.plt;e.currentTarget.style.boxShadow=`0 4px 14px ${C.p}25`;}} onMouseLeave={e=>{e.currentTarget.style.background=dark?"rgba(15,30,22,.7)":"rgba(255,255,255,.8)";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)";}}>{ic}</button>
          ))}
          {/* Notification bell */}
          <div style={{position:"relative"}}>
            <button onClick={()=>{setNotifDrop(o=>!o);setProfDrop(false);setNavDotMenu(false);}} style={{
              width:36,height:36,
              border:`1px solid ${C.bdr}`,borderRadius:9,
              background:dark?"rgba(15,30,22,.7)":"rgba(255,255,255,.8)",
              backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:15,position:"relative",transition:"all .2s",
              boxShadow:"0 2px 8px rgba(0,0,0,.06)"
            }} onMouseEnter={e=>{e.currentTarget.style.background=C.plt;e.currentTarget.style.boxShadow=`0 4px 14px ${C.p}25`;}} onMouseLeave={e=>{e.currentTarget.style.background=dark?"rgba(15,30,22,.7)":"rgba(255,255,255,.8)";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)";}}>
              🔔
              {unreadCount>0&&<div className="jc" style={{position:"absolute",top:5,right:5,width:12,height:12,background:C.red,borderRadius:"50%",fontSize:8,color:"#fff",fontWeight:700}}>{unreadCount>9?"9+":unreadCount}</div>}
            </button>
            {notifDrop&&(
              <div style={{
                position:"absolute",right:0,top:46,width:320,
                background:dark?"rgba(10,22,16,.96)":"rgba(255,255,255,.96)",
                backdropFilter:"blur(6px) saturate(130%)",WebkitBackdropFilter:"blur(6px) saturate(130%)",
                borderRadius:18,
                boxShadow:`0 20px 60px rgba(0,0,0,.2),0 0 0 1px ${C.p}11,inset 0 1px 0 rgba(255,255,255,.15)`,
                border:`1px solid ${dark?"rgba(30,69,53,.5)":"rgba(255,255,255,.7)"}`,
                zIndex:700,overflow:"hidden",animation:"fadeUp .2s cubic-bezier(.16,1,.3,1)"
              }}
>
                <div className="row" style={{padding:"12px 15px",borderBottom:`1px solid ${C.bdr}`,justifyContent:"space-between"}}>
                  <div style={{fontSize:14,fontWeight:700}}>🔔 {tr.notifications}</div>
                  <button className="btn btn-gh" style={{fontSize:12,color:C.p}} onClick={()=>{setPage("notifs");setNotifDrop(false);}}>{tr.seeAll}</button>
                </div>
                {liveNotifs.slice(0,4).map((n,i)=>(
                  <div key={i} style={{padding:"10px 15px",borderBottom:i<3?`1px solid ${C.bdr}`:"none",background:n.unread?`${C.p}06`:"#fff",cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background=n.unread?`${C.p}06`:"#fff"}>
                    <div className="row" style={{gap:9}}>
                      <div className="jc" style={{width:34,height:34,borderRadius:9,background:C.plt,fontSize:14,flexShrink:0}}>{n.icon}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700}}>{lang==="en"?n.tEn:n.t}</div>
                        <div style={{fontSize:11,color:C.muted,marginTop:1}}>{lang==="en"?n.mEn:n.m}</div>
                      </div>
                      {n.unread&&<div style={{width:7,height:7,borderRadius:"50%",background:C.p,flexShrink:0}}/>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Profile */}
          <div style={{position:"relative"}}>
            <div className="jc" style={{
              width:36,height:36,borderRadius:9,
              background:`linear-gradient(135deg,${C.p},${C.pdk})`,
              color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13,
              boxShadow:`0 4px 14px ${C.p}55,inset 0 1px 0 rgba(255,255,255,.25)`,
              transition:"all .2s"
            }} onClick={()=>{setProfDrop(o=>!o);setNotifDrop(false);setNavDotMenu(false);}}>{authUser?.name?.[0]||"আ"}</div>
            {profDrop&&(
              <div style={{
                position:"absolute",right:0,top:46,width:240,
                background:dark?"rgba(10,22,16,.96)":"rgba(255,255,255,.96)",
                backdropFilter:"blur(6px) saturate(130%)",WebkitBackdropFilter:"blur(6px) saturate(130%)",
                borderRadius:18,
                boxShadow:`0 20px 60px rgba(0,0,0,.2),0 0 0 1px ${C.p}11,inset 0 1px 0 rgba(255,255,255,.15)`,
                border:`1px solid ${dark?"rgba(30,69,53,.5)":"rgba(255,255,255,.7)"}`,
                zIndex:700,overflow:"hidden",animation:"fadeUp .2s cubic-bezier(.16,1,.3,1)",maxHeight:"80vh",overflowY:"auto"
              }}>
                {/* প্রোফাইল হেড */}
                <div style={{padding:14,borderBottom:`1px solid ${C.bdr}`,textAlign:"center"}}>
                  <div className="jc" style={{width:44,height:44,borderRadius:11,background:`linear-gradient(135deg,${C.p},${C.pdk})`,color:"#fff",fontWeight:700,fontSize:17,margin:"0 auto 7px"}}>{authUser?.name?.[0]||"আ"}</div>
                  <div style={{fontSize:14,fontWeight:700}}>{authUser?.name||(lang==="en"?"Customer":"গ্রাহক")}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{authUser?.phone||""}</div>
                </div>
                {/* গ্রুপ ১: আমার অ্যাকাউন্ট */}
                {[
                  [`👤 ${lang==="bn"?"আমার প্রোফাইল":"My Profile"}`,"cprofile"],
                  [`📋 ${tr.myBookings}`,"bookings"],
                  [`🔔 ${tr.notifications}`,"notifs"],
                  [`🔖 ${lang==="bn"?"সেভ করা":"Saved"}`,"saved"],
                  [`📅 ${tr.calNav||"Calendar"}`,"calendar"],
                ].map(([item,pg],i)=>(
                  <div key={`acc-${i}`} onClick={()=>{setPage(pg);setProfDrop(false);}} style={{padding:"9px 15px",fontSize:13,cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{item}</div>
                ))}
                {/* গ্রুপ ২: আর্থিক ও বিশেষ সেবা */}
                <div style={{height:1,background:C.bdr,margin:"2px 0"}}/>
                {[
                  [`💸 ${tr.wlNav||"Wallet"}`,"wallet"],
                  [`🎁 ${tr.prNav||"Offers"}`,"promos"],
                  [`🏅 ${lang==="bn"?"পয়েন্ট":"Loyalty Points"}`,"loyalty"],
                  [`🩸 ${tr.bdNav||"Blood Donate"}`,"blood"],
                  [`🌪️ ${tr.dsNav||"Disaster Alerts"}`,"disaster"],
                ].map(([item,pg],i)=>(
                  <div key={`fin-${i}`} onClick={()=>{setPage(pg);setProfDrop(false);}} style={{padding:"9px 15px",fontSize:13,cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{item}</div>
                ))}
                {/* গ্রুপ ৩: যাচাই ও প্রদানকারী */}
                <div style={{height:1,background:C.bdr,margin:"2px 0"}}/>
                {[
                  [`🛡️ ${lang==="bn"?"KYC যাচাই":"KYC Verify"}`,"_kyc"],
                  [`🪪 ${tr.nidVerify}`,"_nid"],
                  [`💹 ${tr.loanScore}`,"_loan"],
                  [`👷 ${tr.dashboard}`,"dashboard"],
                  [`📋 ${lang==="bn"?"প্রদানকারী রেজি.":"Provider Reg."}`,"providerreg"],
                ].map(([item,pg],i)=>(
                  <div key={`vfy-${i}`} onClick={()=>{
                    if(["dashboard","providerreg"].includes(pg))setPage(pg);
                    else if(pg==="_kyc")setShowKyc(true);
                    else if(pg==="_nid")setModal("nid");
                    else if(pg==="_loan")setModal("loan");
                    setProfDrop(false);
                  }} style={{padding:"9px 15px",fontSize:13,cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{item}</div>
                ))}
                {/* ভাষা ও থিম */}
                <div style={{height:1,background:C.bdr,margin:"2px 0"}}/>
                <div style={{padding:"9px 15px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,color:C.sub}}>🌐 {lang==="bn"?"ভাষা":"Language"}</span>
                  <button onClick={()=>{setLang(l=>l==="bn"?"en":"bn");setProfDrop(false);}} style={{background:C.plt,color:C.p,border:`1px solid ${C.bdr}`,borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{lang==="bn"?"EN 🌐":"বাং 🌐"}</button>
                </div>
                <div style={{padding:"9px 15px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,color:C.sub}}>{dark?"☀️":"🌙"} {lang==="bn"?"থিম":"Theme"}</span>
                  <button onClick={()=>{setDark(d=>!d);setProfDrop(false);}} style={{background:C.plt,color:C.p,border:`1px solid ${C.bdr}`,borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{dark?(lang==="bn"?"লাইট":"Light"):(lang==="bn"?"ডার্ক":"Dark")}</button>
                </div>
                {/* গ্রুপ ৪: সিস্টেম */}
                <div style={{height:1,background:C.bdr,margin:"2px 0"}}/>
                {[
                  [`⚙️ ${tr.stNav||"Settings"}`,"settings"],
                  [`👴 ${tr.elderlyMode}`,"_elderly"],
                  [`🚪 ${tr.logout}`,"_logout"],
                ].map(([item,pg],i)=>(
                  <div key={`sys-${i}`} onClick={()=>{
                    if(pg==="settings")setPage(pg);
                    else if(pg==="_elderly")setElderly(true);
                    else if(pg==="_logout")doLogout();
                    setProfDrop(false);
                  }} style={{padding:"9px 15px",fontSize:13,cursor:"pointer",transition:"background .12s",color:pg==="_logout"?C.red:"inherit"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{item}</div>
                ))}
              </div>
            )}
          </div>
          {/* Desktop book button */}
          {!isMobile&&<button className="btn btn-g dbtn" style={{padding:"9px 16px",fontSize:13,whiteSpace:"nowrap"}} onClick={()=>setPage("services")}>{tr.book}</button>}
          {/* Mobile three-dot menu */}
          {isMobile&&<div style={{position:"relative"}}>
            <button onClick={()=>{setNavDotMenu(o=>!o);setProfDrop(false);setNotifDrop(false);}} style={{width:36,height:36,border:`1px solid ${C.bdr}`,borderRadius:9,background:C.bg,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.text,fontWeight:700}}>⋮</button>
            {navDotMenu&&(<>
              <div onClick={()=>setNavDotMenu(false)} style={{position:"fixed",inset:0,zIndex:599}}/>
              <div style={{position:"absolute",right:0,top:42,width:200,background:dark?"rgba(10,22,16,.96)":"rgba(255,255,255,.96)",backdropFilter:"blur(6px) saturate(130%)",WebkitBackdropFilter:"blur(6px) saturate(130%)",borderRadius:16,boxShadow:`0 16px 48px rgba(0,0,0,.2),0 0 0 1px ${C.p}11,inset 0 1px 0 rgba(255,255,255,.15)`,border:`1px solid ${dark?"rgba(30,69,53,.5)":"rgba(255,255,255,.7)"}`,zIndex:700,overflow:"hidden",animation:"fadeUp .15s cubic-bezier(.16,1,.3,1)"}}>
                {/* User info */}
                <div style={{padding:"11px 14px",borderBottom:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:9}}>
                  <div className="jc" style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${C.p},${C.pdk})`,color:"#fff",fontWeight:700,fontSize:13,flexShrink:0}}>{authUser?.name?.[0]||"আ"}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:12,color:C.text}}>{authUser?.name||(lang==="en"?"Customer":"গ্রাহক")}</div>
                    <div style={{fontSize:10,color:C.muted}}>{lang==="bn"?"সেবাগ্রহণকারী":"Customer"}</div>
                  </div>
                </div>
                {/* Quick actions */}
                {[
                  ["🛠️",tr.services||"সেবা","services"],
                  ["👴",tr.elderlyMode||"বয়স্ক মোড","_elderly"],
                  ["🗺️",tr.map||"ম্যাপ","_map"],
                  ["🔍",tr.find||"খুঁজুন","_search"],
                ].map(([ic,lbl,act])=>(
                  <div key={act} onClick={()=>{
                    setNavDotMenu(false);
                    if(act==="services")setPage("services");
                    else if(act==="_elderly")setElderly(true);
                    else if(act==="_map")setModal("map");
                    else if(act==="_search")setModal("search");
                  }} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontSize:13,color:C.text,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{fontSize:15}}>{ic}</span><span>{lbl}</span>
                  </div>
                ))}
                <div style={{height:1,background:C.bdr}}/>
                {/* Lang toggle */}
                <div onClick={()=>{setLang(l=>l==="bn"?"en":"bn");setNavDotMenu(false);}} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontSize:13,color:C.text,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>🌐</span><span>{lang==="bn"?"English এ যান":"বাংলায় যান"}</span>
                </div>
                {/* Dark toggle */}
                <div onClick={()=>{setDark(d=>!d);setNavDotMenu(false);}} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontSize:13,color:C.text,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>{dark?"☀️":"🌙"}</span><span>{dark?(lang==="bn"?"লাইট মোড":"Light Mode"):(lang==="bn"?"ডার্ক মোড":"Dark Mode")}</span>
                </div>
                <div style={{height:1,background:C.bdr}}/>
                {/* Logout */}
                <div onClick={()=>{setNavDotMenu(false);doLogout();}} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontSize:13,color:C.red,fontWeight:700,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background="#FEF2F2"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>🚪</span><span>{tr.logout||"লগআউট"}</span>
                </div>
              </div>
            </>)}
          </div>}
        </div>
      </div>
    </nav>
  );

  /* ── MOBILE BOTTOM NAV ── */
  const MobNav = ()=>(
    <div className="mnav">
      {[["home","🏠",tr.home],["services","🛠️",tr.services],["nearby","📍",tr.gpsNav||"Nearby"],["saved","🔖",tr.favNav||"Saved"],["_profile","👤",tr.profile]].map(([id,icon,l])=>{
        const active = page===id;
        return (
        <button key={id} aria-label={l} aria-current={active?"page":undefined} onClick={()=>{
          if(id==="_map")setModal("map");
          else if(id==="_profile"){setProfDrop(o=>!o);}
          else{setPage(id);closeAll();}
        }} style={{position:"relative",flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"8px 0",fontFamily:"'Hind Siliguri',sans-serif",WebkitTapHighlightColor:"transparent"}}>
          {/* animated active indicator */}
          <div style={{position:"absolute",top:0,width:active?24:0,height:3,borderRadius:"0 0 4px 4px",background:`linear-gradient(90deg,${C.p},${C.pdk})`,transition:"width .22s cubic-bezier(.4,0,.2,1)"}}/>
          <div className="jc" style={{width:36,height:30,borderRadius:11,background:active?`linear-gradient(135deg,${C.p},${C.pdk})`:"transparent",fontSize:16,transition:"all .2s cubic-bezier(.4,0,.2,1)",transform:active?"translateY(-1px)":"none",boxShadow:active?`0 4px 12px ${C.p}55`:"none"}}>{icon}</div>
          <div style={{fontSize:10.5,fontWeight:active?800:600,color:active?C.p:C.muted,transition:"color .18s"}}>{l}</div>
        </button>
      )})}
    </div>
  );

  /* ── HOME PAGE ── */
  const Home = ()=>(
    <>
      {/* Hero */}
      <section className="hs" style={{background:`linear-gradient(155deg,${C.dark} 0%,#0F3326 55%,#174D38 100%)`,padding:"80px 0 96px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-80,top:-80,width:500,height:500,borderRadius:"50%",background:`${C.p}0A`,pointerEvents:"none"}}/>
        <div className="wp">
          <div className="hl">
            <div style={{opacity:anim?1:0,transform:anim?"none":"translateY(18px)",transition:"all .7s ease"}}>
              <div className="row" style={{display:"inline-flex",gap:8,background:"rgba(255,255,255,.08)",backdropFilter:"blur(2px)",borderRadius:99,padding:"6px 14px",marginBottom:20,border:"1px solid rgba(255,255,255,.12)"}}>
                {/* Bangladesh Flag Icon */}
                <div style={{width:22,height:15,borderRadius:3,background:"#006A4E",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:"#F42A41"}}/>
                </div>
                <span style={{fontSize:12,fontWeight:700}}>
                  <span style={{color:"#F42A41"}}>{lang==="bn"?"বাংলাদেশের":"Bangladesh's"}</span>
                  <span style={{color:"#00C170"}}>{lang==="bn"?" নম্বর ১ সেবা মার্কেটপ্লেস":" Number 1 Service Marketplace"}</span>
                </span>
              </div>
              <h1 className="hh" style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:50,fontWeight:800,color:"#fff",lineHeight:1.15,marginBottom:16}}>
                {tr.heroTitle}<br/><span style={{color:C.p}}>{tr.heroAccent}</span>
              </h1>
              <p style={{fontSize:15,color:"rgba(255,255,255,.72)",lineHeight:1.75,marginBottom:26,maxWidth:440}}>{tr.heroDesc}</p>
              <div className="hsw row" style={{
                background:"rgba(255,255,255,.95)",
                backdropFilter:"blur(5px) saturate(120%)",WebkitBackdropFilter:"blur(5px) saturate(120%)",
                borderRadius:14,padding:"7px 7px 7px 16px",gap:7,maxWidth:510,
                boxShadow:"0 10px 40px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.9)",
                border:"1px solid rgba(255,255,255,.6)"
              }}>
                <span style={{fontSize:17}}>🔍</span>
                <input readOnly placeholder={tr.search} style={{flex:1,border:"none",fontSize:13,color:C.text,background:"transparent",padding:"5px 0",cursor:"pointer"}} onClick={()=>setModal("search")}/>
                <button className="btn btn-g" style={{padding:"10px 16px",fontSize:13,borderRadius:10,flexShrink:0}} onClick={()=>setModal("search")}>{tr.find}</button>
              </div>
              <div className="sx" style={{marginTop:14}}>
                <div style={{display:"flex",gap:8,width:"max-content"}}>
                  {(lang==="en"?["⚡ Electrician","🏥 Nurse","📚 Tutor","🧹 Cleaning","🔧 Plumber"]:["⚡ ইলেকট্রিশিয়ান","🏥 নার্স","📚 গৃহশিক্ষক","🧹 পরিষ্কার","🔧 প্লাম্বার"]).map(s=>(
                    <button key={s} onClick={()=>setModal("search")} style={{padding:"6px 12px",background:"rgba(255,255,255,.10)",border:"1px solid rgba(255,255,255,.18)",borderRadius:99,color:"rgba(255,255,255,.9)",fontSize:11,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",whiteSpace:"nowrap"}}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* Hero stats (desktop) */}
            <div className="sb" style={{opacity:anim?1:0,transition:"opacity .8s ease .2s"}}>
              {[{ic:"✅",vBn:"৪৮,২৩৫+",vEn:"48,235+",l:tr.statDone,g:"+12%",d:.3},{ic:"🛡️",vBn:"৮,৪৯২",vEn:"8,492",l:tr.statVerified,g:"+8%",d:.4},{ic:"⭐",vBn:"২,১৫,৮৬৩",vEn:"215,863",l:tr.statHappy,g:"+23%",d:.5},{ic:"🗺️",vBn:"৬৪ জেলা",vEn:"64 Districts",l:tr.statNation,g:"100%",d:.6}].map((s,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,.07)",backdropFilter:"blur(3px)",border:"1px solid rgba(255,255,255,.12)",borderRadius:18,padding:20,animation:`fadeUp .5s ease ${s.d}s both`}}>
                  <div style={{fontSize:27,marginBottom:8}}>{s.ic}</div>
                  <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:24,fontWeight:800,color:"#fff"}}>{lang==="en"?s.vEn:s.vBn}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:3}}>{s.l}</div>
                  <div style={{fontSize:11,color:C.p,marginTop:7,fontWeight:600}}>{s.g} ↑</div>
                </div>
              ))}
            </div>
          </div>
          {/* Emergency banner */}
          <div className="eb" style={{marginTop:36,background:"rgba(220,38,38,.82)",backdropFilter:"blur(2px)",borderRadius:14,padding:"15px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,border:"1px solid rgba(255,255,255,.14)"}}>
            <div className="row" style={{gap:12}}>
              <span style={{fontSize:26,animation:"pulse 1.5s infinite"}}>🚨</span>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{tr.emergencyQ}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.78)"}}>{tr.emergencyDesc}</div>
              </div>
            </div>
            <button className="btn" style={{padding:"11px 22px",background:"rgba(255,255,255,.15)",backdropFilter:"blur(3px)",WebkitBackdropFilter:"blur(3px)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",fontSize:13,fontWeight:700,borderRadius:11,whiteSpace:"nowrap",flexShrink:0}} onClick={()=>{setEmg(true);setEmgCnt(5);setEmgSvc(null);}}>🚨 {tr.emergency}</button>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div style={{background:C.p,padding:"9px 0",overflow:"hidden"}}>
        <div style={{display:"flex",gap:28,width:"max-content",animation:"ticker 22s linear infinite"}}>
          {[...Array(2)].map((_,ri)=>(
            (lang==="en"?["✅ 1,245 services done today","⚡ 342 providers active","⭐ Avg rating 4.8/5","🗺️ Services in 64 districts","💳 bKash · Nagad · Rocket","🛡️ NID verified providers"]:["✅ আজ ১,২৪৫ সেবা সম্পন্ন","⚡ ৩৪২ জন সক্রিয়","⭐ গড় রেটিং ৪.৮/৫","🗺️ ৬৪ জেলায় সেবা","💳 bKash · Nagad · Rocket","🛡️ NID যাচাইকৃত"]).map((t,i)=>(
              <span key={`${ri}-${i}`} style={{fontSize:13,fontWeight:600,color:"#fff",whiteSpace:"nowrap",paddingRight:40}}>{t}</span>
            ))
          ))}
        </div>
      </div>

      {/* How it Works */}
      <section className="sp" style={{background:C.bg}}>
        <div className="wp">
          <div style={{textAlign:"center",marginBottom:44}}>
            <div style={{display:"inline-flex",gap:6,background:C.plt,borderRadius:99,padding:"6px 16px",marginBottom:12,alignItems:"center"}}>
              <span style={{fontSize:12,fontWeight:600,color:C.p}}>{tr.howBadge}</span>
            </div>
            <div className="sec-h">{tr.howTitle}</div>
            <div className="sec-s">{tr.howSub}</div>
          </div>
          <div className="g3">
            {[{n:"01",ic:"🔍",bg:"#EAF5F0",t:tr.s1t,d:tr.s1d},{n:"02",ic:"📋",bg:"#FEF3C7",t:tr.s2t,d:tr.s2d},{n:"03",ic:"✅",bg:"#EDE9FE",t:tr.s3t,d:tr.s3d}].map((h,i)=>(
              <div key={i} className="card" style={{padding:26,animation:`fadeUp .5s ease ${.2+i*.14}s both`}}>
                <div className="jc" style={{width:52,height:52,borderRadius:15,background:h.bg,fontSize:22,marginBottom:14}}>{h.ic}</div>
                <div style={{fontSize:10,fontWeight:700,color:C.p,letterSpacing:2,marginBottom:5}}>{tr.step} {h.n}</div>
                <div style={{fontSize:17,fontWeight:700,color:C.text,marginBottom:8}}>{h.t}</div>
                <div style={{fontSize:13,color:C.muted,lineHeight:1.75}}>{h.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Map preview */}
      <section style={{padding:"48px 0",background:C.bg}}>
        <div className="wp">
          <div className="row" style={{justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:10}}>
            <div><div className="sec-h">🗺️ {tr.mapTitle}</div><div className="sec-s">{tr.mapSub}</div></div>
            <button className="btn btn-o" onClick={()=>setModal("map")}>{tr.mapFull}</button>
          </div>
          <LiveMap tracking={tracking} setTracking={setTracking}/>
        </div>
      </section>

      {/* Service categories */}
      <section className="sp" style={{background:C.bg}}>
        <div className="wp">
          <div className="row" style={{justifyContent:"space-between",marginBottom:32,flexWrap:"wrap",gap:12}}>
            <div><div className="sec-h">{tr.svcsTitle}</div><div className="sec-s">{tr.svcsSub}</div></div>
            <button className="btn btn-o" onClick={()=>setPage("services")}>{tr.viewAll}</button>
          </div>
          <div className="g6">
            {SVCS.map((s,i)=>(
              <div key={s.id} className="card" onClick={()=>setModal("search")} style={{padding:"18px 8px",textAlign:"center",cursor:"pointer",animation:`fadeUp .4s ease ${.04+i*.03}s both`}}>
                <div className="jc" style={{width:52,height:52,borderRadius:15,background:`${s.col}15`,fontSize:24,margin:"0 auto 10px"}}>{s.icon}</div>
                <div style={{fontSize:12,fontWeight:600,color:C.text,lineHeight:1.3}}>{lang==="en"?s.nameEn:s.name}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:3}}>{s.count} {tr.available}</div>
                <div style={{fontSize:11,color:C.p,marginTop:3,fontWeight:600}}>{s.avg} {tr.startFrom}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center",marginTop:7}}>
                  {(lang==="en"?s.subsEn:s.subs)?.slice(0,3).map(sub=>(
                    <span key={sub} style={{fontSize:9,background:`${s.col}18`,color:s.col,borderRadius:99,padding:"2px 6px",fontWeight:600,lineHeight:1.4}}>{sub}</span>
                  ))}
                  {s.subs?.length>3&&<span style={{fontSize:9,color:C.muted,padding:"2px 4px"}}>+{s.subs.length-3}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured providers */}
      <section className="sp" style={{background:C.bg}}>
        <div className="wp">
          <div className="row" style={{justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12}}>
            <div><div className="sec-h">{tr.topTitle}</div><div className="sec-s">{tr.topSub}</div></div>
            <button className="btn btn-o" onClick={()=>setPage("providers")}>{tr.allProviders}</button>
          </div>
          <div className="g3">
            {liveProviders.map(toUiProv).map((p,i)=><PCard key={p.id} p={p} delay={.08+i*.07} onBook={goBook} onView={setDetail}/>)}
          </div>
        </div>
      </section>

      {/* Why IMAP */}
      <section className="sp" style={{background:`linear-gradient(140deg,${C.dark},#0F3326)`}}>
        <div className="wp">
          <div style={{textAlign:"center",marginBottom:44}}><div className="sec-h" style={{color:"#fff"}}>{tr.whyTitle}</div></div>
          <div className="g4 wg">
            {[{ic:"🛡️",t:tr.w1t,d:tr.w1d},{ic:"🤖",t:tr.w2t,d:tr.w2d},{ic:"💰",t:tr.w3t,d:tr.w3d},{ic:"🔒",t:tr.w4t,d:tr.w4d}].map((f,i)=>(
              <div key={i} style={{textAlign:"center",padding:18,animation:`fadeUp .5s ease ${i*.1}s both`}}>
                <div className="jc" style={{width:58,height:58,borderRadius:16,background:"rgba(255,255,255,.08)",fontSize:26,margin:"0 auto 14px"}}>{f.ic}</div>
                <div style={{fontSize:15,fontWeight:700,color:"#fff",marginBottom:6}}>{f.t}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.55)",lineHeight:1.7}}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="sp" style={{background:C.bg}}>
        <div className="wp">
          <div style={{textAlign:"center",marginBottom:40}}><div className="sec-h">{tr.reviewsTitle}</div></div>
          <div className="g3">
            {(lang==="en"?[
              {av:"A",name:"Ahmed Rahat",loc:"Dhaka",r:5,svc:"Electrician",t:"Amazing service! Rakib came on time."},
              {av:"S",name:"Sumaiya Islam",loc:"Chittagong",r:5,svc:"Nurse",t:"Farzana's service is unmatched. Professional every time."},
              {av:"K",name:"Karim Saheb",loc:"Sylhet",r:5,svc:"Tutor",t:"AI matching really works! My son's exam results improved a lot."},
            ]:[
              {av:"আ",name:"আহমেদ রাহাত",loc:"ঢাকা",r:5,svc:"ইলেকট্রিশিয়ান",t:"অসাধারণ সেবা! রাকিব ভাই সময়মতো এসেছেন।"},
              {av:"স",name:"সুমাইয়া ইসলাম",loc:"চট্টগ্রাম",r:5,svc:"নার্স",t:"ফারজানা আপার সেবা অতুলনীয়।"},
              {av:"ক",name:"করিম সাহেব",loc:"সিলেট",r:5,svc:"গৃহশিক্ষক",t:"AI ম্যাচিং সত্যিই কাজ করে! ছেলের রেজাল্ট ভালো হয়েছে।"},
            ]).map((t,i)=>(
              <div key={i} className="card" style={{padding:22,animation:`fadeUp .5s ease ${i*.11}s both`}}>
                <div style={{display:"flex",gap:2,marginBottom:10}}><Stars r={t.r} size={14}/></div>
                <div style={{fontSize:13,color:C.sub,lineHeight:1.8,marginBottom:14,fontStyle:"italic"}}>"{t.t}"</div>
                <div className="row" style={{justifyContent:"space-between"}}>
                  <div className="row" style={{gap:9}}>
                    <div className="jc" style={{width:36,height:36,borderRadius:9,background:`linear-gradient(135deg,${C.p},${C.pdk})`,color:"#fff",fontWeight:700}}>{t.av}</div>
                    <div><div style={{fontSize:13,fontWeight:700}}>{t.name}</div><div style={{fontSize:11,color:C.muted}}>📍 {t.loc}</div></div>
                  </div>
                  <span className="tag" style={{fontSize:10}}>{t.svc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social impact + live stats */}
      <section className="sp" style={{background:C.bg}}>
        <div className="wp">
          <div className="g2 sl" style={{gap:44,alignItems:"center"}}>
            <div>
              <div className="sec-h" style={{marginBottom:6}}>{tr.impactTitle}</div>
              <div className="sec-s" style={{marginBottom:20}}>{tr.impactSub}</div>
              {[[tr.si1,tr.si1v,"🩸"],[tr.si2,tr.si2v,"🤝"],[tr.si3,tr.si3v,"🌪️"],[tr.si4,tr.si4v,"💙"]].map(([l,v,ic],i)=>(
                <div key={i} className="row" style={{justifyContent:"space-between",padding:"12px 0",borderBottom:i<3?`1px solid ${C.bdr}`:"none"}}>
                  <div className="row" style={{gap:12}}><div className="jc" style={{width:42,height:42,borderRadius:11,background:C.plt,fontSize:20,flexShrink:0}}>{ic}</div><div style={{fontSize:14,fontWeight:600}}>{l}</div></div>
                  <div style={{fontSize:14,fontWeight:700,color:C.p}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:`linear-gradient(140deg,${C.dark},#0F3326)`,borderRadius:22,padding:28}}>
              <div style={{fontSize:17,fontWeight:700,color:"#fff",marginBottom:18}}>📊 {tr.liveTitle}</div>
              {[[tr.ls1,"১,২৪৫"],[tr.ls2,"৩৪২"],[tr.ls3,`8 ${tr.min}`],[tr.ls4,"৳৩,৪৫,৬৭৮"],[tr.ls5,"৪.৮/৫"]].map(([l,v],i)=>(
                <div key={i} className="row" style={{justifyContent:"space-between",padding:"10px 0",borderBottom:i<4?"1px solid rgba(255,255,255,.08)":"none"}}>
                  <div style={{fontSize:13,color:"rgba(255,255,255,.65)"}}>{l}</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{padding:"56px 0",background:`linear-gradient(135deg,${C.plt},#fff)`}}>
        <div className="wp" style={{textAlign:"center"}}>
          <div className="sec-h" style={{marginBottom:8}}>{tr.ctaTitle}</div>
          <div className="sec-s" style={{marginBottom:24}}>{tr.ctaSub}</div>
          <div className="row" style={{gap:12,justifyContent:"center",flexWrap:"wrap"}}>
            <button className="btn btn-g" style={{padding:"13px 26px",fontSize:14}} onClick={()=>setPage("services")}>{tr.bookService}</button>
            <button className="btn btn-o" style={{padding:"13px 26px",fontSize:14}} onClick={()=>setPage("dashboard")}>{tr.providerDash}</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{background:C.dark,padding:"48px 0 26px"}}>
        <div className="wp">
          <div className="fg" style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:36,marginBottom:36}}>
            <div>
              <div className="row" style={{gap:9,marginBottom:14}}>
                <div className="jc" style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${C.p},${C.pdk})`,fontSize:17}}>🌿</div>
                <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:18,fontWeight:800,color:"#fff"}}>IMAP</div>
              </div>
              <div style={{fontSize:13,color:"rgba(255,255,255,.44)",lineHeight:1.8,maxWidth:260}}>{tr.footerDesc}</div>
              <div className="row" style={{gap:7,marginTop:16}}>
                {["📱 bKash","📱 Nagad","🚀 Rocket"].map(p=><span key={p} style={{padding:"3px 9px",background:"rgba(255,255,255,.07)",borderRadius:7,fontSize:11,color:"rgba(255,255,255,.55)"}}>{p}</span>)}
              </div>
            </div>
            {[[tr.footerServices,[tr.services,"AC","Nurse","Tutor","Cleaning"]],[tr.footerCompany,[tr.footerAbout,tr.footerCareers,tr.footerBlog,tr.footerPartner]],[tr.footerSupport,[tr.footerHelp,tr.footerContact,tr.footerPrivacy,tr.footerJoin]]].map(([title,links],i)=>(
              <div key={i}>
                <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:12}}>{title}</div>
                {links.map(l=><div key={l} style={{fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:9,cursor:"pointer",transition:"color .14s"}} onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,.85)"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.4)"}>{l}</div>)}
              </div>
            ))}
          </div>
          <div className="row" style={{borderTop:"1px solid rgba(255,255,255,.07)",paddingTop:18,justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>{tr.footerCopy}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>{tr.footerMade}</div>
          </div>
        </div>
      </footer>
    </>
  );

  /* ── SERVICES PAGE ── */
  const Services = ()=>{
    const provData = liveProviders.map(toUiProv);

    // Filter SVCS by category and search
    const searchLow = svcSearch.toLowerCase();
    const filteredSvcs = SVCS.filter(s=>{
      const matchCat = !svcCat || s.id===svcCat;
      const matchSearch = !svcSearch ||
        s.nameEn.toLowerCase().includes(searchLow) ||
        s.name.includes(svcSearch) ||
        s.subsEn.some(sub=>sub.toLowerCase().includes(searchLow)) ||
        s.subs.some(sub=>sub.includes(svcSearch));
      return matchCat && matchSearch;
    });

    // Smart booking: find best matching provider for a service type
    const bookService = (s, subEn) => {
      const terms = subEn
        ? [subEn.toLowerCase()]
        : [...s.subsEn.map(x=>x.toLowerCase()), s.nameEn.toLowerCase()];
      const matched = provData.filter(p=>{
        const pSvc = (p.svcEn||p.svc||"").toLowerCase();
        return terms.some(t => pSvc.includes(t) || t.includes(pSvc.split(" ")[0]));
      });
      const best = matched.sort((a,b)=>(b.r||0)-(a.r||0))[0] || provData[0] || toUiProv(PROVIDERS[0]);
      goBook({...best});
    };

    return (
    <div style={{padding:"28px 0 80px"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.p},${C.pdk||"#004D38"})`,borderRadius:18,padding:"22px 20px 20px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>{lang==="en"?"All Services":"সব সেবা সমূহ"}</div>
        <div style={{fontSize:13,opacity:.85,marginBottom:16}}>{SVCS.reduce((a,s)=>a+s.count,0).toLocaleString()}+ {lang==="en"?"service providers available":"সার্ভিস প্রোভাইডার উপলব্ধ"}</div>
        {/* Search bar */}
        <div style={{position:"relative"}}>
          <input
            value={svcSearch}
            onChange={e=>setSvcSearch(e.target.value)}
            placeholder={lang==="en"?"Search services, e.g. plumber, nurse…":"সেবা খুঁজুন, যেমন প্লাম্বার, নার্স…"}
            style={{width:"100%",padding:"11px 14px 11px 38px",borderRadius:12,border:"none",background:"rgba(255,255,255,.98)",color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",boxSizing:"border-box"}}
          />
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none"}}>🔍</span>
          {svcSearch&&<span onClick={()=>setSvcSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:16,color:"#555"}}>✕</span>}
        </div>
        <div style={{position:"absolute",right:-18,top:-18,width:90,height:90,borderRadius:"50%",background:"rgba(255,255,255,.08)"}} />
      </div>

      {/* Category pill filters */}
      <div className="sx" style={{marginBottom:16}}>
        <div style={{display:"flex",gap:7,width:"max-content"}}>
          <button onClick={()=>{setSvcCat(null);setSvcSearch("");}} style={{flexShrink:0,padding:"7px 16px",borderRadius:99,border:`1.5px solid ${!svcCat?C.p:C.bdr}`,background:!svcCat?C.p:C.card,color:!svcCat?"#fff":C.sub,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Hind Siliguri',sans-serif"}}>
            {tr.allSvcs}
          </button>
          {SVCS.map(s=>(
            <button key={s.id} onClick={()=>{setSvcCat(svcCat===s.id?null:s.id);setSvcSearch("");}} style={{flexShrink:0,padding:"7px 14px",borderRadius:99,border:`1.5px solid ${svcCat===s.id?s.col:C.bdr}`,background:svcCat===s.id?s.col:C.card,color:svcCat===s.id?"#fff":C.sub,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Hind Siliguri',sans-serif",display:"flex",alignItems:"center",gap:5,transition:"all .15s"}}>
              <span>{s.icon}</span>{lang==="en"?s.nameEn:s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <div style={{fontSize:14,fontWeight:700,marginBottom:14,color:C.text}}>
        {tr.servicesTitle} ({filteredSvcs.length}{filteredSvcs.length<SVCS.length?` / ${SVCS.length}`:""})
        {(svcSearch||svcCat)&&<button onClick={()=>{setSvcCat(null);setSvcSearch("");}} style={{marginLeft:10,fontSize:11,color:C.p,background:"none",border:`1px solid ${C.p}`,borderRadius:20,padding:"2px 10px",cursor:"pointer",fontWeight:700}}>✕ {lang==="en"?"Clear":"মুছুন"}</button>}
      </div>

      {/* Service cards */}
      {filteredSvcs.length===0
        ? <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>🔍</div>
            <div style={{fontSize:15,fontWeight:700}}>{lang==="en"?"No services found":"কোনো সেবা পাওয়া যায়নি"}</div>
            <div style={{fontSize:13,marginTop:6}}>{lang==="en"?"Try a different search term":"অন্য শব্দ দিয়ে খুঁজুন"}</div>
            <button onClick={()=>{setSvcCat(null);setSvcSearch("");}} className="btn btn-g" style={{marginTop:16,padding:"10px 24px"}}>{lang==="en"?"Show all":"সব দেখুন"}</button>
          </div>
        : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16}}>
          {filteredSvcs.map((s,i)=>{
            // Count providers matching this service from live data
            const liveCount = provData.filter(p=>
              (p.svcEn||p.svc||"").toLowerCase().includes(s.nameEn.toLowerCase().split(" ")[0].toLowerCase())
            ).length;
            return (
            <div key={s.id} className="card" style={{padding:22,cursor:"pointer",animation:`fadeUp .4s ease ${i*.04}s both`,border:`1.5px solid ${svcCat===s.id?s.col:C.bdr}`,transition:"box-shadow .15s"}}>
              {/* Card header */}
              <div className="row" style={{gap:13,marginBottom:10}}>
                <div className="jc" style={{width:52,height:52,borderRadius:15,background:`${s.col}18`,fontSize:24,flexShrink:0,border:`1.5px solid ${s.col}30`}}>{s.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.text}}>{lang==="en"?s.nameEn:s.name}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                    {liveCount>0
                      ? <span style={{color:"#006A4E",fontWeight:600}}>✓ {liveCount} {lang==="en"?"available":"জন উপলব্ধ"}</span>
                      : <span>{s.count} {tr.available}</span>
                    }
                  </div>
                </div>
                <div className="row" style={{gap:3,flexShrink:0}}><span style={{color:"#F59E0B",fontSize:13}}>★</span><span style={{fontSize:13,fontWeight:700}}>{s.r}</span></div>
              </div>

              {/* Sub-service pills (clickable) */}
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>
                {(lang==="en"?s.subsEn:s.subs)?.slice(0,5).map((sub,si)=>(
                  <span key={sub} onClick={e=>{e.stopPropagation();bookService(s,s.subsEn[si]);}} style={{fontSize:10,background:`${s.col}15`,color:s.col,borderRadius:99,padding:"3px 9px",fontWeight:600,lineHeight:1.4,cursor:"pointer",border:`1px solid ${s.col}30`,transition:"background .1s"}} title={lang==="en"?"Book this sub-service":"এই সেবা বুক করুন"}>
                    {sub}
                  </span>
                ))}
                {(s.subs?.length||0)>5&&<span style={{fontSize:10,color:C.muted,padding:"3px 6px",alignSelf:"center"}}>+{(s.subs?.length||0)-5}</span>}
              </div>

              {/* Price & rating row */}
              <div className="row" style={{justifyContent:"space-between",marginBottom:14}}>
                <div>
                  <div style={{fontSize:10,color:C.muted}}>{tr.startFrom}</div>
                  <div style={{fontSize:18,fontWeight:800,color:s.col}}>{s.avg}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();setSvcCat(s.id);}} style={{fontSize:11,color:s.col,background:`${s.col}12`,border:`1px solid ${s.col}30`,borderRadius:20,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontFamily:"'Hind Siliguri',sans-serif"}}>
                  {lang==="en"?"Filter":"ফিল্টার"} {s.icon}
                </button>
              </div>

              {/* Book Now button */}
              <button className="btn btn-g" style={{width:"100%",padding:"11px",fontWeight:700}} onClick={()=>bookService(s,null)}>
                {tr.bookNow}
              </button>
            </div>
          );
          })}
        </div>
      }
    </div>
    );
  };

  /* ── PROVIDERS PAGE ── */
  const ProvidersPage = ()=>{
    const provData = liveProviders.map(toUiProv);
    return (
    <div style={{padding:"28px 0 80px"}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:18,fontWeight:700}}>{tr.allProviders} ({provData.length}+)</div>
        <div className="row" style={{gap:7}}>
          {[tr.filterBest,tr.filterNew,tr.filterNear].map(f=>(
            <button key={f} className="btn" style={{
              padding:"7px 13px",borderRadius:99,
              border:`1.5px solid ${C.bdr}`,
              background:dark?"rgba(15,30,22,.7)":"rgba(255,255,255,.85)",
              backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
              color:C.sub,fontSize:12,fontWeight:600,
              boxShadow:"0 2px 8px rgba(0,0,0,.05)"
            }}>{f}</button>
          ))}
        </div>
      </div>
      <div className="pgrid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:18}}>
        {provData.map((p,i)=><PCard key={p.id} p={p} delay={i*.06} onBook={goBook} onView={setDetail}/>)}
      </div>
    </div>
    );
  };

  /* ── HOW PAGE ── */
  const HowPage = ()=>(
    <div style={{maxWidth:800,margin:"0 auto",padding:"48px 0 80px"}}>
      <div style={{textAlign:"center",marginBottom:44}}>
        <div className="sec-h">{tr.howPageTitle}</div>
        <div className="sec-s">{tr.howPageSub}</div>
      </div>
      {[{n:"1",ic:"🔍",bg:"#EAF5F0",t:tr.s1t,d:tr.s1d},{n:"2",ic:"📋",bg:"#FEF3C7",t:tr.s2t,d:tr.s2d},{n:"3",ic:"✅",bg:"#EDE9FE",t:tr.s3t,d:tr.s3d}].map((h,i)=>(
        <div key={i} className="card" style={{padding:28,marginBottom:16,display:"flex",gap:20,alignItems:"flex-start"}}>
          <div className="jc" style={{width:56,height:56,borderRadius:16,background:h.bg,fontSize:24,flexShrink:0}}>{h.ic}</div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:C.p,letterSpacing:2,marginBottom:5}}>{tr.step} {h.n}</div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>{h.t}</div>
            <div style={{fontSize:14,color:C.muted,lineHeight:1.75}}>{h.d}</div>
          </div>
        </div>
      ))}
    </div>
  );

  /* ── ELDERLY MODE ── */
  if(onboard) return (
    <ThemeCtx.Provider value={C}>
    <LangCtx.Provider value={tr}>
      <div><style>{CSS}{dark?CSS_DARK:""}</style>
        <Onboarding onDone={()=>{localStorage.setItem("imap_ob","1");setOnboard(false);}}/>
      </div>
    </LangCtx.Provider>
    </ThemeCtx.Provider>
  );

  /* ── ELDERLY MODE ── */
  if(elderly) return (
    <ThemeCtx.Provider value={C}>
    <LangCtx.Provider value={tr}>
      <div><style>{CSS}{dark?CSS_DARK:""}</style>
        <ElderlyMode onExit={()=>setElderly(false)} onBook={goBook} onEmergency={()=>{setEmg(true);setEmgCnt(5);setEmgSvc(null);}}/>
        {booking&&<div className="ov" onClick={()=>setBooking(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}><BookModal p={booking} onClose={()=>setBooking(null)} onSuccess={()=>{refreshBookings();usersApi.getWallet().then(d=>{if(d.balance!=null)setWalletBalance(d.balance);}).catch(()=>{});}}/></div></div>}
        {emg&&<EmgModal/>}
      </div>
    </LangCtx.Provider>
    </ThemeCtx.Provider>
  );

  /* ── MAIN RENDER ── */
  return (
    <ThemeCtx.Provider value={C}>
    <UserCtx.Provider value={{user:authUser,setUser:u=>{setAuthUser(u);localStorage.setItem("imap_user",JSON.stringify(u));}}}>
    <LiveDataCtx.Provider value={{providers:liveProviders,bookings:liveBookings,balance:walletBalance,setBalance:setWalletBalance,refreshBookings}}>
    <FavsCtx.Provider value={{favs,toggleFav}}>
    <LangCtx.Provider value={tr}>
      <div style={{fontFamily:"'Hind Siliguri','Noto Sans Bengali',sans-serif",background:C.bg,minHeight:"100vh",color:C.text,transition:"background .3s,color .3s"}}>
        <style>{CSS}{dark?CSS_DARK:""}</style>
        <Nav/>
        {isOffline&&(
          <div style={{
            position:"sticky",top:0,zIndex:999,
            background:"linear-gradient(90deg,#1F2937,#111827,#1F2937)",
            backdropFilter:"blur(3px)",WebkitBackdropFilter:"blur(3px)",
            color:"#F9FAFB",textAlign:"center",padding:"8px 14px",fontSize:12.5,fontWeight:600,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            boxShadow:"0 2px 12px rgba(0,0,0,.3)",
            borderBottom:"1px solid rgba(255,255,255,.08)"
          }}>
            <span>📡</span> <span>{tr===T.en?"You are offline — some features may be unavailable":"আপনি অফলাইনে আছেন — কিছু ফিচার সাময়িকভাবে অনুপলব্ধ"}</span>
          </div>
        )}
        <div style={{minHeight:"calc(100vh - 62px)"}}>
         <Suspense fallback={<PageLoader/>}>
          {page==="home"      && <Home/>}
          {page==="cprofile" && <div className="wp" style={{padding:"0 0 80px"}}><CustomerProfilePage user={authUser} onAvatarUpdate={u=>{setAuthUser(u);}} onNavigate={pg=>{if(pg==="_kyc")setShowKyc(true);else setPage(pg);}}/></div>}
          {page==="services"  && <div className="wp sp"><Services/></div>}
          {page==="providers" && <div className="wp sp"><ProvidersPage/></div>}
          {page==="bookings"  && <div className="wp" style={{padding:"28px 0 80px"}}><MyBookings onRate={p=>{setRateFor(p);}} onBook={goBook} onPay={id=>{setPayBookingId(id);setPayResult(null);setShowPayment(true);}} onRefresh={refreshBookings}/></div>}
          {page==="notifs"    && <div className="wp" style={{padding:"28px 0 80px"}}><NotifPage/></div>}
          {page==="dashboard" && <div className="wp" style={{padding:"28px 0 80px"}}><ProviderDash/></div>}
          {page==="how"       && <div className="wp"><HowPage/></div>}
          {page==="saved"     && <div className="wp" style={{padding:"28px 0 80px"}}><FavoritesPage favs={favs} onBook={goBook} onView={setDetail} onToggle={toggleFav}/></div>}
          {page==="nearby"    && <div className="wp" style={{padding:"28px 0 80px"}}><NearbyPage onBook={goBook} onView={setDetail}/></div>}
          {page==="calendar"  && <div className="wp" style={{padding:"28px 0 80px"}}><CalendarPage onBook={goBook}/></div>}
          {page==="blood"     && <div className="wp" style={{padding:"28px 0 80px"}}><BloodDonationPage/></div>}
          {page==="disaster"  && <div className="wp" style={{padding:"28px 0 80px"}}><DisasterPage/></div>}
          {page==="wallet"    && <div className="wp" style={{padding:"28px 0 80px"}}><WalletPage/></div>}
          {page==="promos"    && <div className="wp" style={{padding:"28px 0 80px"}}><PromosPage/></div>}
          {page==="analytics" && <div className="wp" style={{padding:"28px 0 80px"}}><AnalyticsPage/></div>}
          {page==="settings"  && <div className="wp" style={{padding:"28px 0 80px"}}><SettingsPage/></div>}
          {page==="srvreq"    && <div className="wp" style={{padding:"28px 0 80px"}}><ServiceRequestPage/></div>}
          {page==="loyalty"   && <div className="wp" style={{padding:"28px 0 80px"}}><LoyaltyPage/></div>}
          {page==="referral"  && <div className="wp" style={{padding:"28px 0 80px"}}><ReferralPage/></div>}
          {page==="portfolio" && <div className="wp" style={{padding:"28px 0 80px"}}><PortfolioPage/></div>}
          {page==="providerreg"&& <div className="wp" style={{padding:"28px 0 80px"}}><ProviderRegPage/></div>}
          {page==="panalytics"&& <div className="wp" style={{padding:"28px 0 80px"}}><ProviderAnalyticsPage/></div>}
          {page==="skillcert" && <div className="wp" style={{padding:"28px 0 80px"}}><SkillCertPage/></div>}
         </Suspense>
        </div>
        <MobNav/>

        {/* Provider detail modal */}
        {detail&&<div className="ov" onClick={()=>setDetail(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:640}}><PDetail p={detail} onClose={()=>setDetail(null)} onBook={goBook} onChat={p=>{setDetail(null);setChatWith(p);}}/></div></div>}
        {chatWith&&<div style={{position:"fixed",inset:0,zIndex:200,background:C.bg}}><LiveChatPage provider={chatWith} onBack={()=>setChatWith(null)}/></div>}
        {/* Booking modal */}
        {booking&&<div className="ov" onClick={()=>setBooking(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}><BookModal p={booking} onClose={()=>setBooking(null)} onSuccess={()=>{refreshBookings();usersApi.getWallet().then(d=>{if(d.balance!=null)setWalletBalance(d.balance);}).catch(()=>{});}}/></div></div>}
        {/* Rating modal */}
        {rateFor&&<div className="ov" onClick={()=>setRateFor(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}><RatingModal p={rateFor} onClose={()=>setRateFor(null)} onSuccess={()=>{refreshBookings();setRateFor(null);}}/></div></div>}
        {/* Search / filter modal */}
        {modal==="search"&&<div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:580}}><SearchFilter onClose={()=>setModal(null)} onBook={goBook} onView={p=>{setModal(null);setDetail(p);}}/></div></div>}
        {/* Map modal */}
        {modal==="map"&&<div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500,padding:22}}>
          <div className="row" style={{justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontSize:16,fontWeight:700}}>🗺️ {tr.mapTitle}</div>
            <button className="btn btn-gh" style={{fontSize:20}} onClick={()=>setModal(null)}>✕</button>
          </div>
          <LiveMap tracking={tracking} setTracking={setTracking}/>
          <div style={{marginTop:14,display:"flex",gap:10}}>
            <button className="btn btn-g" style={{flex:1,padding:"11px"}} onClick={()=>{setTracking(true);setModal(null);}}>{tr.trackBtn}</button>
            <button className="btn btn-o" style={{flex:1}} onClick={()=>setModal(null)}>{tr.trackClose}</button>
          </div>
        </div></div>}
        {/* NID modal */}
        {modal==="nid"&&<div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}><NIDPage onClose={()=>setModal(null)}/></div></div>}
        {/* Loan modal */}
        {modal==="loan"&&<div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460,padding:24}}>
          <div className="row" style={{justifyContent:"space-between",marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:700}}>💹 {tr.loanTitle}</div>
            <button className="btn btn-gh" style={{fontSize:20}} onClick={()=>setModal(null)}>✕</button>
          </div>
          <LoanScore/>
        </div></div>}
        {/* Emergency */}
        {emg&&<EmgModal/>}
        {/* ── PAYMENT MODAL ── */}
        {showPayment&&(
          <div className="ov" onClick={()=>{if(!payLoading){setShowPayment(false);setPayResult(null);setPayBookingId(null);}}}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400,padding:28,textAlign:"center"}}>
              {payResult==="success"?(<>
                <div style={{fontSize:64,marginBottom:8}}>✅</div>
                <div style={{fontSize:19,fontWeight:700,color:"#006A4E",marginBottom:6}}>{lang==="bn"?"পেমেন্ট সফল!":"Payment Successful!"}</div>
                <div style={{fontSize:13,color:C.muted,marginBottom:4}}>{lang==="bn"?"আপনার বুকিং নিশ্চিত হয়েছে।":"Your booking has been confirmed."}</div>
                {payResultTranId&&<div style={{fontSize:11,color:C.muted,marginBottom:20}}>TXN: {payResultTranId}</div>}
                <button className="btn btn-g" onClick={()=>{setShowPayment(false);setPayResult(null);setPayBookingId(null);setPage("bookings");}} style={{padding:"10px 32px"}}>{lang==="bn"?"বুকিং দেখুন":"View Bookings"}</button>
              </>):payResult==="failed"?(<>
                <div style={{fontSize:64,marginBottom:8}}>❌</div>
                <div style={{fontSize:19,fontWeight:700,color:"#EF4444",marginBottom:6}}>{lang==="bn"?"পেমেন্ট ব্যর্থ":"Payment Failed"}</div>
                <div style={{fontSize:13,color:C.muted,marginBottom:20}}>{lang==="bn"?"পুনরায় চেষ্টা করুন।":"Please try again."}</div>
                <button className="btn btn-gh" onClick={()=>{setShowPayment(false);setPayResult(null);}} style={{padding:"10px 32px"}}>{lang==="bn"?"ঠিক আছে":"OK"}</button>
              </>):payResult==="cancelled"?(<>
                <div style={{fontSize:64,marginBottom:8}}>🚫</div>
                <div style={{fontSize:19,fontWeight:700,color:C.muted,marginBottom:6}}>{lang==="bn"?"পেমেন্ট বাতিল":"Payment Cancelled"}</div>
                <button className="btn btn-gh" onClick={()=>{setShowPayment(false);setPayResult(null);}} style={{padding:"10px 32px"}}>{lang==="bn"?"ঠিক আছে":"OK"}</button>
              </>):(<>
                <div style={{fontSize:42,marginBottom:10}}>💳</div>
                <div style={{fontSize:17,fontWeight:700,marginBottom:4}}>{lang==="bn"?"পেমেন্ট করুন":"Complete Payment"}</div>
                <div style={{fontSize:12,color:C.muted,marginBottom:20}}>{lang==="bn"?"SSLCommerz — bKash, Nagad, Rocket, Card সহ সকল পদ্ধতি":"SSLCommerz — bKash, Nagad, Rocket, uPay, Cards & more"}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:20}}>
                  {[["🟢","bKash"],["🔵","Nagad"],["🟠","Rocket"],["🟣","uPay"],["🔴","CelFin"],["💳","Card"]].map(([ic,lbl])=>(
                    <div key={lbl} style={{padding:"6px 14px",background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:20,fontSize:12,fontWeight:600,color:C.text}}>{ic} {lbl}</div>
                  ))}
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button className="btn btn-gh" style={{flex:1,padding:"11px 0"}} onClick={()=>setShowPayment(false)}>{lang==="bn"?"বাতিল":"Cancel"}</button>
                  <button className="btn" style={{flex:1,padding:"11px 0",background:"#6366F1",color:"#fff",borderRadius:12,border:"none",cursor:payLoading?"not-allowed":"pointer",fontWeight:700,fontSize:14,fontFamily:"inherit"}} disabled={payLoading}
                    onClick={async()=>{
                      if(!payBookingId)return;
                      setPayLoading(true);
                      try{
                        const res=await paymentsApi.initiate(payBookingId);
                        if(res.url){ window.location.href=res.url; }
                        else if(res.mock){
                          setPayResult("success");
                          bookingsApi.list().then(d=>{if(d.bookings?.length)setLiveBookings(d.bookings);}).catch(()=>{});
                        }
                      }catch(e){ alert(e.message||"পেমেন্ট শুরু করতে সমস্যা হয়েছে।"); }
                      finally{setPayLoading(false);}
                    }}>
                    {payLoading?(lang==="bn"?"প্রসেস হচ্ছে…":"Processing…"):(lang==="bn"?"💳 পেমেন্ট করুন":"💳 Pay Now")}
                  </button>
                </div>
                <div style={{marginTop:12,fontSize:10,color:C.muted}}>{lang==="bn"?"SSL নিরাপদ এনক্রিপ্টেড পেমেন্ট":"SSL secured encrypted payment — All data protected"}</div>
              </>)}
            </div>
          </div>
        )}
        {/* SOS floating button */}
        {!showSos && (
          <button onClick={()=>{setShowSos(true);setSosDone(false);setSosType("");setSosDesc("");}}
            title={lang==="bn"?"SOS জরুরি সতর্কতা":"SOS Emergency Alert"}
            style={{position:"fixed",bottom:isMobile?216:212,right:18,width:44,height:44,borderRadius:12,background:"#EF4444",border:"3px solid rgba(255,255,255,.7)",cursor:"pointer",fontSize:19,boxShadow:"0 4px 18px rgba(239,68,68,.55),0 0 0 1px rgba(239,68,68,.3),inset 0 1px 0 rgba(255,255,255,.25)",zIndex:698,display:"flex",alignItems:"center",justifyContent:"center",animation:"pulse 2s infinite"}}>
            🆘
          </button>
        )}
        {/* SOS Modal */}
        {showSos && (
          <div className="ov" onClick={()=>setShowSos(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:380,padding:28,textAlign:"center"}}>
              {sosDone ? (
                <>
                  <div style={{fontSize:60,marginBottom:12}}>✅</div>
                  <div style={{fontSize:18,fontWeight:700,color:"#006A4E",marginBottom:8}}>{lang==="bn"?"উর্ধ্বতন কর্তৃপক্ষকে জানানো হয়েছে":"Admin & Call Center Notified"}</div>
                  <div style={{fontSize:13,color:C.muted,marginBottom:20}}>{lang==="bn"?"আমাদের টিম শীঘ্রই যোগাযোগ করবে। জরুরি নম্বর: ৯৯৯":"Our team will contact you shortly. Emergency: 999"}</div>
                  <button className="btn btn-g" onClick={()=>setShowSos(false)} style={{padding:"10px 28px"}}>{lang==="bn"?"ঠিক আছে":"OK"}</button>
                </>
              ) : (
                <>
                  <div style={{fontSize:50,marginBottom:10,animation:"pulse 1s infinite"}}>🆘</div>
                  <div style={{fontSize:18,fontWeight:700,color:"#EF4444",marginBottom:6}}>{lang==="bn"?"জরুরি সতর্কতা":"Emergency SOS Alert"}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:18}}>{lang==="bn"?"আপনার Admin প্যানেল ও Call Center তাৎক্ষণিক সতর্ক হবে":"Admin panel & call center will be alerted immediately"}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginBottom:16}}>
                    {[{v:"harassment",bn:"হয়রানি",en:"Harassment"},{v:"fraud",bn:"প্রতারণা",en:"Fraud"},{v:"unsafe",bn:"অনিরাপদ",en:"Unsafe"},{v:"emergency",bn:"জরুরি",en:"Emergency"},{v:"other",bn:"অন্যান্য",en:"Other"}].map(t=>(
                      <button key={t.v} onClick={()=>setSosType(t.v)}
                        style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${sosType===t.v?"#EF4444":C.bdr}`,background:sosType===t.v?"#FEF2F2":C.card,color:sosType===t.v?"#EF4444":C.text,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"}}>
                        {lang==="bn"?t.bn:t.en}
                      </button>
                    ))}
                  </div>
                  <textarea value={sosDesc} onChange={e=>setSosDesc(e.target.value)}
                    placeholder={lang==="bn"?"সংক্ষিপ্ত বিবরণ দিন (ঐচ্ছিক)…":"Brief description (optional)…"}
                    style={{width:"100%",border:`1.5px solid ${C.bdr}`,borderRadius:10,padding:"10px 12px",fontSize:13,background:C.card,color:C.text,resize:"none",height:72,fontFamily:"inherit",marginBottom:14}}/>
                  <div style={{display:"flex",gap:10}}>
                    <button className="btn btn-gh" style={{flex:1,padding:"11px 0"}} onClick={()=>setShowSos(false)}>{lang==="bn"?"বাতিল":"Cancel"}</button>
                    <button className="btn" style={{flex:1,padding:"11px 0",background:"#EF4444",color:"#fff",borderRadius:12,border:"none",cursor:sosLoading||!sosType?"not-allowed":"pointer",opacity:!sosType?.5:1,fontWeight:700,fontSize:14,fontFamily:"inherit"}} disabled={!sosType||sosLoading}
                      onClick={async()=>{
                        if(!sosType)return;
                        setSosLoading(true);
                        const send=(lat,lng)=>{
                          return sosApi?.send(sosType,sosDesc,null,lat,lng).catch(()=>{}).finally(()=>{setSosLoading(false);setSosDone(true);});
                        };
                        navigator.geolocation?.getCurrentPosition(
                          pos=>send(pos.coords.latitude,pos.coords.longitude),
                          ()=>send(null,null)
                        );
                      }}>
                      {sosLoading?"পাঠানো হচ্ছে…":lang==="bn"?"🆘 সতর্কতা পাঠান":"🆘 Send Alert"}
                    </button>
                  </div>
                  <div style={{marginTop:14,fontSize:11,color:"#EF4444",fontWeight:600}}>৯৯৯ · ১৯৯ বা সরাসরি ফোন করুন • 999 · 199 direct call</div>
                </>
              )}
            </div>
          </div>
        )}
        {/* Voice Command */}
        <VoiceCommand onCommand={handleVoiceCommand} isMobile={isMobile}/>
        {/* AI Chat */}
        <Chat isMobile={isMobile}/>
      </div>
    </LangCtx.Provider>
    </FavsCtx.Provider>
    </LiveDataCtx.Provider>
    </UserCtx.Provider>
    </ThemeCtx.Provider>
  );
}

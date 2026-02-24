import { useState, useRef, useEffect } from "react";

/* ═══════════════════════════════════════════════════════ */
export default function LandingPage({ dark = false, setDark, lang = "bn", setLang, onGetStarted, onRegisterProvider }) {
  /* ── All data moved inside component to avoid Rollup TDZ in bundle ── */
  const CATS = [
    { icon:"🚨", name:"জরুরি সেবা",          nameEn:"Emergency",        col:"#EF4444", price:"বিনামূল্যে" },
    { icon:"🏠", name:"গৃহ রক্ষণাবেক্ষণ",    nameEn:"Home Maintenance", col:"#F59E0B", price:"৳৩৫০+" },
    { icon:"🧹", name:"পরিষ্কার সেবা",       nameEn:"Cleaning",         col:"#14B8A6", price:"৳৪০০+" },
    { icon:"👩‍⚕️", name:"স্বাস্থ্যসেবা",       nameEn:"Healthcare",       col:"#EF4444", price:"৳৫০০+" },
    { icon:"📚", name:"শিক্ষা সেবা",         nameEn:"Education",        col:"#8B5CF6", price:"৳৪০০+" },
    { icon:"🚚", name:"স্থানান্তর",           nameEn:"Moving",           col:"#F97316", price:"৳২০০০+" },
    { icon:"🍲", name:"রান্না ও খাবার",       nameEn:"Food & Cooking",   col:"#F59E0B", price:"৳৬০০+" },
    { icon:"🧑‍💼", name:"পেশাদার পরামর্শ",    nameEn:"Professional",     col:"#6366F1", price:"৳৮০০+" },
    { icon:"🛡️", name:"নিরাপত্তা সেবা",     nameEn:"Security",         col:"#374151", price:"৳৫০০+" },
    { icon:"🛒", name:"দৈনন্দিন সহায়তা",   nameEn:"Daily Errands",    col:"#EC4899", price:"৳১৫০+" },
    { icon:"🧓", name:"বয়স্ক সেবা",         nameEn:"Elderly Care",     col:"#7C3AED", price:"৳৪০০+" },
    { icon:"👶", name:"শিশু ও পরিবার",      nameEn:"Child & Family",   col:"#DB2777", price:"৳৪০০+" },
  ];
  const FAQ_BN = [
    { q:"সেবার দাম কত?",             a:"আমাদের সেবা শুরু হয় মাত্র ৳১৫০ থেকে। জরুরি সেবা সম্পূর্ণ বিনামূল্যে। প্রতিটি সেবার নির্দিষ্ট মূল্যসীমা সার্ভিস পেজে দেখা যায়।" },
    { q:"কিভাবে বুক করব?",           a:"১) Login করুন  ২) সেবা বেছে নিন  ৩) কাছের Provider দেখুন  ৪) সময়সূচি ও মূল্য নিশ্চিত করুন  ৫) বুকিং কনফার্ম করুন — Provider নির্ধারিত সময়ে আসবেন।" },
    { q:"Provider হব কিভাবে?",       a:"Register করুন 'Service Provider' হিসেবে → NID ও প্রয়োজনীয় কাগজ আপলোড করুন (KYC) → ৪৮ ঘণ্টার মধ্যে Approval → কাজ শুরু করুন ও আয় করুন!" },
    { q:"এটা কি নিরাপদ?",            a:"অবশ্যই! প্রতিটি Provider KYC-যাচাইকৃত ও NID-ভেরিফাইড। Service চলাকালীন আমাদের 🆘 SOS বাটন সব সময় সক্রিয়। যেকোনো অপ্রীতিকর ঘটনায় তাৎক্ষণিক Admin ও Call Center জানানো হয়।" },
    { q:"জরুরি অবস্থায় কী করব?",   a:"App-এর 🆘 SOS বাটন চাপুন — Admin ও Call Center তাৎক্ষণিক জানবে। অথবা সরাসরি ফোন করুন: ৯৯৯ (পুলিশ), ১৯৯ (ফায়ার সার্ভিস), ১৬৪৩০ (ন্যাশনাল হেল্পলাইন)।" },
    { q:"Payment কিভাবে?",           a:"Cash on Delivery, bKash, Nagad ও Card payment — সব গ্রহণযোগ্য। Transaction সম্পূর্ণ এনক্রিপ্টেড ও নিরাপদ।" },
    { q:"কোনো সমস্যা হলে?",          a:"Service-এর মধ্যে SOS বাটন চাপুন বা 🔴 Report করুন। আমাদের WhatsApp: +880 1XXXXXXXX বা Call করুন। সকল অভিযোগ ২৪ ঘণ্টার মধ্যে সমাধান করা হয়।" },
    { q:"Cancel করতে পারব?",         a:"Service শুরুর ২ ঘণ্টা আগে Cancel করলে সম্পূর্ণ Refund। ১ ঘণ্টার কম সময়ে ৫০% চার্জ প্রযোজ্য। Provider-ও Cancel করলে কোনো চার্জ নেই।" },
  ];
  const FAQ_EN = [
    { q:"What are the prices?",        a:"Services start from just ৳150. Emergency services are completely free. Exact pricing is shown on each service page." },
    { q:"How do I book a service?",    a:"1) Login  2) Choose a service  3) Browse nearby Providers  4) Confirm time & price  5) Book — Provider will arrive at the scheduled time." },
    { q:"How to become a Provider?",   a:"Register as 'Service Provider' → Upload NID & documents (KYC) → Get approval within 48 hours → Start earning!" },
    { q:"Is it safe?",                 a:"Absolutely! Every Provider is KYC-verified with NID. The 🆘 SOS button is always active during service. Any incident is instantly forwarded to Admin & Call Center." },
    { q:"Emergency situation?",        a:"Press the 🆘 SOS button in the app — Admin and Call Center are notified immediately. Or call: 999 (Police), 199 (Fire Service), 16430 (National Helpline)." },
    { q:"How to pay?",                 a:"Cash on Delivery, bKash, Nagad and Card — all accepted. Transactions are fully encrypted and secure." },
    { q:"Problem with service?",       a:"Press SOS or Report during the service. WhatsApp: +880 1XXXXXXXX or call us. All complaints resolved within 24 hours." },
    { q:"Can I cancel?",               a:"Full refund if cancelled 2+ hours before service. 50% charge within 1 hour. No charge if Provider cancels." },
  ];
  const matchFaq = (text, lng) => {
    const list  = lng === "en" ? FAQ_EN : FAQ_BN;
    const lower = text.toLowerCase();
    const keys  = ["দাম|price|cost|কত|charge|fee","বুক|book|কিভাবে|how","provider|হব|earn|income|আয়|কাজ","নিরাপদ|safe|security|trust","জরুরি|emergency|sos|বিপদ|danger","payment|pay|bkash|nagad|টাকা","সমস্যা|problem|issue|complaint|অভিযোগ","cancel|refund|ফেরত"];
    for (let ki = 0; ki < keys.length; ki++) {
      if (keys[ki].split("|").some(k => lower.includes(k))) return list[ki];
    }
    return { q:"", a: lng === "en"
      ? "I can help with: pricing, booking, becoming a provider, safety, emergency, payment, complaints, and cancellation. What would you like to know?"
      : "আমি সাহায্য করতে পারি: মূল্য, বুকিং, Provider হওয়া, নিরাপত্তা, জরুরি সেবা, পেমেন্ট, অভিযোগ এবং বাতিল বিষয়ে। কী জানতে চান?" };
  };

  /* ── Brand colours (kept inside component to avoid TDZ in bundle) ── */
  const G   = "#16A34A";
  const GD  = "#0F5E2E";
  const GBG = "#F0FDF4";
  const WH  = "#FFFFFF";

  const [aiOpen,   setAiOpen]   = useState(false);
  const [aiMsg,    setAiMsg]    = useState("");
  const [aiChat,   setAiChat]   = useState([
    { from:"bot", text: lang === "en"
        ? "Hi! I'm IMAP AI Assistant. Ask me anything about our services, pricing, safety, or how to book! 👋"
        : "হ্যালো! আমি IMAP AI Assistant। সেবা, মূল্য, নিরাপত্তা বা বুকিং সম্পর্কে যেকোনো প্রশ্ন করুন! 👋" }
  ]);
  const [mobMenu,  setMobMenu]  = useState(false);
  const chatEndRef = useRef(null);

  const bg   = dark ? "#0F172A" : "#FAFFFE";
  const card = dark ? "#1E293B" : WH;
  const txt  = dark ? "#F1F5F9" : "#1A2E1A";
  const sub  = dark ? "#94A3B8" : "#4B5563";
  const bdr  = dark ? "#334155" : "#E5E7EB";

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiChat]);

  const sendAi = () => {
    const q = aiMsg.trim();
    if (!q) return;
    setAiMsg("");
    const userMsg = { from: "user", text: q };
    const res     = matchFaq(q, lang);
    setAiChat(c => [...c, userMsg, { from: "bot", text: res.a }]);
  };

  const tr = {
    bn: {
      tagline:"বাংলাদেশের #১ AI-পাওয়ার্ড সার্ভিস প্ল্যাটফর্ম",
      sub:"ঘরে বসে বিশ্বস্ত সেবা নিন  •  আয় করুন  •  সম্পূর্ণ নিরাপদ",
      bookBtn:"সেবা নিন",        provBtn:"সেবাদাতা হোন",
      loginBtn:"লগইন",           regBtn:"নিবন্ধন",
      svcTitle:"আমাদের সেবাসমূহ", svcSub:"লগইন ছাড়াই ব্রাউজ করুন",
      howTitle:"কিভাবে কাজ করে?",
      trustTitle:"কেন আমাদের বিশ্বাস করবেন?",
      aiTitle:"AI সহায়তা",       aiSub:"প্রশ্ন করুন, তাৎক্ষণিক উত্তর পান",
      aiPlaceholder:"যেকোনো প্রশ্ন লিখুন…",
      contactTitle:"যোগাযোগ করুন",
      safetyTitle:"নিরাপত্তা আমাদের সর্বোচ্চ অগ্রাধিকার",
      sosTitle:"SOS জরুরি সতর্কতা",
      sosDesc:"Service চলাকালীন যেকোনো অপ্রীতিকর পরিস্থিতিতে একটি বাটন চাপলেই Admin প্যানেল ও Call Center তাৎক্ষণিক সতর্ক হয়। আইনি ব্যবস্থা নেওয়ার সুযোগ থাকে।",
      footerDesc:"বাংলাদেশের মানুষের জন্য, বিশ্বস্ত সেবা নিশ্চিত করতে।",
    },
    en: {
      tagline:"Bangladesh's #1 AI-Powered Service Platform",
      sub:"Get trusted home services  •  Earn money  •  Completely safe",
      bookBtn:"Get Service",     provBtn:"Become Provider",
      loginBtn:"Login",          regBtn:"Register",
      svcTitle:"Our Services",   svcSub:"Browse without logging in",
      howTitle:"How does it work?",
      trustTitle:"Why trust us?",
      aiTitle:"AI Assistant",    aiSub:"Ask anything, get instant answers",
      aiPlaceholder:"Type your question…",
      contactTitle:"Contact Us",
      safetyTitle:"Safety is our top priority",
      sosTitle:"SOS Emergency Alert",
      sosDesc:"During any service, one tap of the SOS button instantly alerts Admin Panel & Call Center. Legal action can be taken against perpetrators.",
      footerDesc:"For the people of Bangladesh, ensuring trusted services.",
    },
  }[lang] || {};

  const HOW = lang === "en" ? [
    { icon:"🔍", t:"Browse",     d:"Explore 500+ services without login" },
    { icon:"✅", t:"Register",   d:"Quick signup with phone or email" },
    { icon:"📅", t:"Book",       d:"Choose provider, time & confirm" },
    { icon:"🏆", t:"Done!",      d:"Rate & review after service" },
  ] : [
    { icon:"🔍", t:"ব্রাউজ করুন", d:"লগইন ছাড়াই ৫০০+ সেবা দেখুন" },
    { icon:"✅", t:"নিবন্ধন করুন",d:"ফোন বা ইমেইল দিয়ে সহজ রেজিস্ট্রেশন" },
    { icon:"📅", t:"বুক করুন",   d:"Provider, সময় ও মূল্য নিশ্চিত করুন" },
    { icon:"🏆", t:"সম্পন্ন!",   d:"সেবা শেষে রেটিং ও রিভিউ দিন" },
  ];

  const TRUST = lang === "en" ? [
    { icon:"🛡️", t:"Verified Providers",  d:"Every provider NID-verified & KYC checked" },
    { icon:"🔒", t:"Secure Payments",      d:"Encrypted transactions, money-back guarantee" },
    { icon:"📞", t:"24/7 Support",         d:"Call center always ready to help" },
    { icon:"⚖️", t:"Legal Protection",    d:"Complete legal framework — no fraud tolerated" },
    { icon:"🆘", t:"Emergency SOS",        d:"Instant admin alert during any incident" },
    { icon:"⭐", t:"4.8★ Rated",          d:"10,000+ happy customers across Bangladesh" },
  ] : [
    { icon:"🛡️", t:"যাচাইকৃত Provider",d:"প্রতিটি Provider NID-ভেরিফাইড ও KYC-পরীক্ষিত" },
    { icon:"🔒", t:"নিরাপদ পেমেন্ট",   d:"এনক্রিপ্টেড লেনদেন, মানি-ব্যাক গ্যারান্টি" },
    { icon:"📞", t:"২৪/৭ সাপোর্ট",    d:"Call Center সর্বদা সহায়তার জন্য প্রস্তুত" },
    { icon:"⚖️", t:"আইনি সুরক্ষা",    d:"সম্পূর্ণ আইনি কাঠামো — কোনো প্রতারণা সহ্য নয়" },
    { icon:"🆘", t:"জরুরি SOS",        d:"যেকোনো ঘটনায় তাৎক্ষণিক Admin সতর্কতা" },
    { icon:"⭐", t:"৪.৮★ রেটিং",       d:"বাংলাদেশ জুড়ে ১০,০০০+ সন্তুষ্ট গ্রাহক" },
  ];

  const isMob = typeof window !== "undefined" && window.innerWidth <= 640;

  return (
    <div style={{ fontFamily:"'Hind Siliguri','Noto Sans Bengali',sans-serif", background:bg, color:txt, minHeight:"100vh", lineHeight:1.6 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .lp-btn{border:none;cursor:pointer;font-family:inherit;transition:all .18s;border-radius:12px;font-weight:700}
        .lp-btn-g{background:${G};color:#fff;padding:12px 28px}
        .lp-btn-g:hover{background:${GD};transform:translateY(-1px)}
        .lp-btn-o{background:transparent;color:${G};border:2px solid ${G};padding:11px 26px}
        .lp-btn-o:hover{background:${GBG}}
        .lp-btn-sm{background:${G};color:#fff;padding:8px 18px;font-size:13px;border-radius:9px;border:none;cursor:pointer;font-weight:600}
        .svc-card{padding:18px;border-radius:16px;border:1.5px solid ${bdr};background:${card};cursor:pointer;transition:all .2s;text-align:center}
        .svc-card:hover{transform:translateY(-3px);box-shadow:0 8px 28px rgba(22,163,74,.15)}
        .trust-card{padding:20px;border-radius:14px;background:${card};border:1px solid ${bdr}}
        .ai-bubble-bot{background:${dark?"#1E3A2F":"#DCFCE7"};border-radius:16px 16px 16px 4px;padding:12px 16px;max-width:88%;word-break:break-word;color:${txt}}
        .ai-bubble-user{background:${G};color:#fff;border-radius:16px 16px 4px 16px;padding:12px 16px;max-width:88%;word-break:break-word;margin-left:auto}
        .contact-btn{display:flex;align-items:center;gap:12px;padding:16px 20px;border-radius:14px;border:1.5px solid ${bdr};background:${card};cursor:pointer;transition:all .18s;text-decoration:none;color:${txt}}
        .contact-btn:hover{border-color:${G};box-shadow:0 4px 16px rgba(22,163,74,.12)}
        @media(max-width:640px){.lp-grid{grid-template-columns:repeat(3,1fr)!important}.lp-how{grid-template-columns:repeat(2,1fr)!important}.lp-trust{grid-template-columns:repeat(2,1fr)!important}.lp-contact{grid-template-columns:1fr!important}.lp-hero-btns{flex-direction:column!important}}
      `}</style>

      {/* ── TOP NAV ── */}
      <nav style={{ background:card, borderBottom:`1px solid ${bdr}`, position:"sticky", top:0, zIndex:900, boxShadow:"0 1px 12px rgba(0,0,0,.06)" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 20px", height:62, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer" }}>
            <div style={{ width:36, height:36, borderRadius:11, background:`linear-gradient(135deg,${G},${GD})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🌿</div>
            <div>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:800, color:G, lineHeight:1 }}>IMAP</div>
              <div style={{ fontSize:9, color:sub, letterSpacing:1.3, textTransform:"uppercase" }}>AI Powered Service</div>
            </div>
          </div>

          {/* Desktop nav */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {/* Language toggle — hidden on mobile */}
            <button onClick={() => setLang && setLang(lang === "bn" ? "en" : "bn")}
              style={{ background:"none", border:`1px solid ${bdr}`, borderRadius:8, padding:"5px 11px", cursor:"pointer", fontSize:12, fontWeight:600, color:sub, display: isMob ? "none" : "block" }}>
              {lang === "bn" ? "EN" : "বাং"}
            </button>
            {/* Dark toggle — hidden on mobile */}
            <button onClick={() => setDark && setDark(d => !d)}
              style={{ background:"none", border:`1px solid ${bdr}`, borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:14, display: isMob ? "none" : "block" }}>
              {dark ? "☀️" : "🌙"}
            </button>
            <button className="lp-btn lp-btn-o" style={{ fontSize:13, padding:"7px 14px" }} onClick={onGetStarted}>{tr.loginBtn}</button>
            <button className="lp-btn lp-btn-g" style={{ fontSize:13, padding:"8px 14px" }} onClick={onGetStarted}>{tr.regBtn}</button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ background:`linear-gradient(155deg,${dark?"#0A1F12":GD} 0%,${dark?"#0F3326":"#145232"} 55%,${dark?"#0F2A1C":"#1A6040"} 100%)`, padding:"80px 20px 90px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", right:-100, top:-100, width:500, height:500, borderRadius:"50%", background:"rgba(255,255,255,.04)", pointerEvents:"none" }}/>
        <div style={{ position:"absolute", left:-60, bottom:-60, width:300, height:300, borderRadius:"50%", background:"rgba(255,255,255,.03)", pointerEvents:"none" }}/>
        <div style={{ maxWidth:780, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.12)", borderRadius:30, padding:"6px 18px", fontSize:12, color:"#86efac", marginBottom:22, border:"1px solid rgba(255,255,255,.15)" }}>
            🇧🇩 &nbsp;Bangladesh's Trusted Service Platform
          </div>
          <h1 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize: isMob ? 28 : 42, fontWeight:800, color:WH, lineHeight:1.25, marginBottom:16 }}>
            {tr.tagline}
          </h1>
          <p style={{ fontSize:16, color:"#86efac", marginBottom:36, lineHeight:1.7 }}>{tr.sub}</p>

          {/* Stats bar */}
          <div style={{ display:"flex", justifyContent:"center", gap:32, marginBottom:40, flexWrap:"wrap" }}>
            {[["500+", lang==="en"?"Services":"সেবা"], ["10K+", lang==="en"?"Customers":"গ্রাহক"], ["1200+", lang==="en"?"Providers":"Provider"], ["4.8★", lang==="en"?"Rating":"রেটিং"]].map(([v,l]) => (
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:800, color:WH, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{v}</div>
                <div style={{ fontSize:11, color:"#86efac" }}>{l}</div>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="lp-hero-btns" style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
            <button className="lp-btn" style={{ background:WH, color:G, fontSize:15, padding:"14px 36px", borderRadius:14, fontWeight:800 }} onClick={onGetStarted}>
              🛍️ {tr.bookBtn}
            </button>
            <button className="lp-btn" style={{ background:"transparent", color:WH, border:"2px solid rgba(255,255,255,.4)", fontSize:15, padding:"13px 34px", borderRadius:14, fontWeight:700 }}
              onClick={onRegisterProvider}>
              👷 {tr.provBtn}
            </button>
            <button className="lp-btn" style={{ background:"rgba(255,255,255,.1)", color:WH, fontSize:14, padding:"12px 26px", borderRadius:14, border:"1px solid rgba(255,255,255,.2)" }}
              onClick={() => setAiOpen(true)}>
              🤖 {lang === "en" ? "Ask AI" : "AI-কে জিজ্ঞেস করুন"}
            </button>
          </div>

          {/* Trust badges */}
          <div style={{ marginTop:32, display:"flex", justifyContent:"center", gap:20, flexWrap:"wrap" }}>
            {["✅ KYC Verified", "🔒 Secure Payment", "🆘 SOS Protected", "⚖️ Legal Shield"].map(b => (
              <div key={b} style={{ fontSize:11, color:"rgba(255,255,255,.65)", display:"flex", alignItems:"center", gap:5 }}>{b}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section style={{ padding:"64px 20px", background: dark ? "#0F172A" : "#F8FFFA" }}>
        <div style={{ maxWidth:1200, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:36 }}>
            <div style={{ fontSize:11, letterSpacing:2, color:G, fontWeight:700, textTransform:"uppercase", marginBottom:8 }}>500+ সেবা</div>
            <h2 style={{ fontSize:28, fontWeight:800, marginBottom:8 }}>{tr.svcTitle}</h2>
            <p style={{ color:sub, fontSize:14 }}>{tr.svcSub}</p>
          </div>
          <div className="lp-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
            {CATS.map(c => (
              <div key={c.name} className="svc-card" onClick={onGetStarted}
                style={{ borderTop:`3px solid ${c.col}` }}>
                <div style={{ fontSize:32, marginBottom:8 }}>{c.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color:txt, lineHeight:1.35, marginBottom:4 }}>{lang === "en" ? c.nameEn : c.name}</div>
                <div style={{ fontSize:11, color:G, fontWeight:600 }}>{c.price}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:"center", marginTop:28 }}>
            <button className="lp-btn lp-btn-g" onClick={onGetStarted} style={{ fontSize:14, padding:"12px 32px" }}>
              {lang === "en" ? "View All Services →" : "সব সেবা দেখুন →"}
            </button>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding:"64px 20px", background:card }}>
        <div style={{ maxWidth:900, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:40 }}>
            <div style={{ fontSize:11, letterSpacing:2, color:G, fontWeight:700, textTransform:"uppercase", marginBottom:8 }}>Simple Process</div>
            <h2 style={{ fontSize:28, fontWeight:800 }}>{tr.howTitle}</h2>
          </div>
          <div className="lp-how" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:20 }}>
            {HOW.map((h, i) => (
              <div key={i} style={{ textAlign:"center", padding:"24px 16px", borderRadius:16, border:`1.5px solid ${bdr}`, position:"relative" }}>
                <div style={{ position:"absolute", top:-14, left:"50%", transform:"translateX(-50%)", width:28, height:28, borderRadius:"50%", background:G, color:WH, fontWeight:800, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>{i+1}</div>
                <div style={{ fontSize:40, marginBottom:10, marginTop:6 }}>{h.icon}</div>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>{h.t}</div>
                <div style={{ fontSize:12, color:sub, lineHeight:1.5 }}>{h.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST PILLARS ── */}
      <section style={{ padding:"64px 20px", background: dark ? "#0A1F12" : GBG }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:40 }}>
            <div style={{ fontSize:11, letterSpacing:2, color:G, fontWeight:700, textTransform:"uppercase", marginBottom:8 }}>Trust & Safety</div>
            <h2 style={{ fontSize:28, fontWeight:800 }}>{tr.trustTitle}</h2>
          </div>
          <div className="lp-trust" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {TRUST.map((t, i) => (
              <div key={i} className="trust-card">
                <div style={{ fontSize:30, marginBottom:10 }}>{t.icon}</div>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>{t.t}</div>
                <div style={{ fontSize:12, color:sub, lineHeight:1.6 }}>{t.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SAFETY + SOS SECTION ── */}
      <section style={{ padding:"64px 20px", background: dark ? "#1A0A0A" : "#FFF7F7" }}>
        <div style={{ maxWidth:900, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:36 }}>
            <div style={{ fontSize:11, letterSpacing:2, color:"#EF4444", fontWeight:700, textTransform:"uppercase", marginBottom:8 }}>🛡️ Security First</div>
            <h2 style={{ fontSize:28, fontWeight:800 }}>{tr.safetyTitle}</h2>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            {/* SOS Card */}
            <div style={{ background: dark?"#2D1515":"#FEF2F2", border:"2px solid #FCA5A5", borderRadius:18, padding:28 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🆘</div>
              <div style={{ fontWeight:800, fontSize:17, color:"#DC2626", marginBottom:10 }}>{tr.sosTitle}</div>
              <p style={{ fontSize:13, color: dark?"#FCA5A5":"#7F1D1D", lineHeight:1.7 }}>{tr.sosDesc}</p>
              <div style={{ marginTop:16, fontSize:12, color:"#DC2626", fontWeight:600 }}>
                {lang === "en"
                  ? "Emergency numbers: 999 · 199 · 16430"
                  : "জরুরি নম্বর: ৯৯৯ · ১৯৯ · ১৬৪৩০"}
              </div>
            </div>

            {/* Anti-fraud Card */}
            <div style={{ background: dark?"#1A1A30":"#EEF2FF", border:"2px solid #A5B4FC", borderRadius:18, padding:28 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>⚖️</div>
              <div style={{ fontWeight:800, fontSize:17, color:"#4338CA", marginBottom:10 }}>
                {lang === "en" ? "Legal Protection & Anti-Fraud" : "আইনি সুরক্ষা ও প্রতারণা-বিরোধী"}
              </div>
              <p style={{ fontSize:13, color: dark?"#A5B4FC":"#3730A3", lineHeight:1.7 }}>
                {lang === "en"
                  ? "All providers sign our Code of Conduct. Fraud, harassment or misconduct leads to immediate account suspension and legal action under Bangladesh law."
                  : "সব Provider আমাদের আচরণবিধি স্বাক্ষর করেন। প্রতারণা, হয়রানি বা অসদাচরণে তাৎক্ষণিক অ্যাকাউন্ট বাতিল ও বাংলাদেশ আইনে আইনি ব্যবস্থা।"}
              </p>
              <div style={{ marginTop:16, fontSize:12, color:"#4338CA", fontWeight:600 }}>
                {lang === "en" ? "Zero tolerance for misconduct" : "অসদাচরণে শূন্য সহনশীলতা"}
              </div>
            </div>

            {/* Verification Card */}
            <div style={{ background: dark?"#0D2018":"#DCFCE7", border:"2px solid #86EFAC", borderRadius:18, padding:28 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🪪</div>
              <div style={{ fontWeight:800, fontSize:17, color:"#15803D", marginBottom:10 }}>
                {lang === "en" ? "Mandatory KYC Verification" : "বাধ্যতামূলক KYC যাচাই"}
              </div>
              <p style={{ fontSize:13, color: dark?"#86EFAC":"#14532D", lineHeight:1.7 }}>
                {lang === "en"
                  ? "Every provider must verify their NID, face photo, and credentials before any service. No anonymous providers allowed."
                  : "প্রতিটি Provider-কে NID, মুখের ছবি ও যোগ্যতার সনদ যাচাই করতে হয়। কোনো পরিচয়হীন Provider অনুমোদন নেই।"}
              </p>
            </div>

            {/* Privacy Card */}
            <div style={{ background: dark?"#1A1520":"#FAF5FF", border:"2px solid #D8B4FE", borderRadius:18, padding:28 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔐</div>
              <div style={{ fontWeight:800, fontSize:17, color:"#7C3AED", marginBottom:10 }}>
                {lang === "en" ? "Data Privacy & Security" : "ডেটা গোপনীয়তা ও নিরাপত্তা"}
              </div>
              <p style={{ fontSize:13, color: dark?"#D8B4FE":"#4C1D95", lineHeight:1.7 }}>
                {lang === "en"
                  ? "Your data is encrypted end-to-end. We never share personal information with third parties. SSL secured and GDPR/BDPA compliant."
                  : "আপনার ডেটা এন্ড-টু-এন্ড এনক্রিপ্টেড। তৃতীয় পক্ষের সাথে ব্যক্তিগত তথ্য কখনো শেয়ার নয়। SSL সুরক্ষিত ও BDPA-সম্মত।"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section style={{ padding:"64px 20px", background: card }}>
        <div style={{ maxWidth:800, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:36 }}>
            <div style={{ fontSize:11, letterSpacing:2, color:G, fontWeight:700, textTransform:"uppercase", marginBottom:8 }}>Live Support</div>
            <h2 style={{ fontSize:28, fontWeight:800 }}>{tr.contactTitle}</h2>
            <p style={{ color:sub, fontSize:14, marginTop:8 }}>
              {lang === "en" ? "Reach us instantly — 24/7 available" : "যেকোনো সময় যোগাযোগ করুন — ২৪/৭ সক্রিয়"}
            </p>
          </div>
          <div className="lp-contact" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {/* WhatsApp */}
            <a href="https://wa.me/8801XXXXXXXXX" target="_blank" rel="noopener noreferrer" className="contact-btn">
              <div style={{ width:46, height:46, borderRadius:13, background:"#25D366", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>💬</div>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>WhatsApp</div>
                <div style={{ fontSize:12, color:sub }}>+880 1XXX-XXXXXX</div>
              </div>
            </a>

            {/* Phone */}
            <a href="tel:+8801XXXXXXXXX" className="contact-btn">
              <div style={{ width:46, height:46, borderRadius:13, background:"#3B82F6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>📞</div>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>{lang === "en" ? "Call Center" : "কল সেন্টার"}</div>
                <div style={{ fontSize:12, color:sub }}>+880 1XXX-XXXXXX</div>
              </div>
            </a>

            {/* AI Chat */}
            <div className="contact-btn" onClick={() => setAiOpen(true)} style={{ cursor:"pointer" }}>
              <div style={{ width:46, height:46, borderRadius:13, background:`linear-gradient(135deg,${G},#0891B2)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🤖</div>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>AI Assistant</div>
                <div style={{ fontSize:12, color:sub }}>{lang === "en" ? "Instant answers" : "তাৎক্ষণিক উত্তর"}</div>
              </div>
            </div>
          </div>

          {/* Emergency line */}
          <div style={{ marginTop:24, padding:"16px 22px", borderRadius:14, background: dark?"#1A0A0A":"#FFF1F2", border:"1.5px solid #FCA5A5", display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ fontSize:28 }}>🚨</div>
            <div>
              <div style={{ fontWeight:700, color:"#DC2626", fontSize:14 }}>
                {lang === "en" ? "National Emergency Numbers" : "জাতীয় জরুরি নম্বর"}
              </div>
              <div style={{ fontSize:13, color: dark?"#FCA5A5":"#7F1D1D" }}>
                999 ({lang === "en"?"Police":"পুলিশ"}) &nbsp;·&nbsp; 199 ({lang === "en"?"Fire":"ফায়ার"}) &nbsp;·&nbsp; 16430 ({lang === "en"?"Helpline":"হেল্পলাইন"}) &nbsp;·&nbsp; 10921 ({lang === "en"?"Women Helpline":"মহিলা সহায়তা"})
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: dark?"#0A0A0A":GD, padding:"48px 20px 24px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:32, marginBottom:36 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:`linear-gradient(135deg,${G},#0891B2)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>🌿</div>
                <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:17, fontWeight:800, color:WH }}>IMAP</div>
              </div>
              <p style={{ fontSize:13, color:"#86EFAC", lineHeight:1.7, maxWidth:240 }}>{tr.footerDesc}</p>
            </div>
            {[
              { title: lang === "en" ? "Services" : "সেবা", links: lang === "en" ? ["Emergency","Home Maintenance","Cleaning","Healthcare"] : ["জরুরি সেবা","গৃহ রক্ষণাবেক্ষণ","পরিষ্কার","স্বাস্থ্যসেবা"] },
              { title: lang === "en" ? "Company" : "কোম্পানি", links: lang === "en" ? ["About Us","Careers","Press","Blog"] : ["আমাদের সম্পর্কে","ক্যারিয়ার","পুরস্কার","ব্লগ"] },
              { title: lang === "en" ? "Legal" : "আইনি", links: lang === "en" ? ["Privacy Policy","Terms of Service","Refund Policy","Safety Guidelines"] : ["গোপনীয়তা নীতি","সেবার শর্ত","রিফান্ড নীতি","নিরাপত্তা নির্দেশিকা"] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontWeight:700, color:WH, marginBottom:12, fontSize:14 }}>{col.title}</div>
                {col.links.map(l => (
                  <div key={l} style={{ fontSize:12, color:"#86EFAC", marginBottom:8, cursor:"pointer" }}
                    onMouseEnter={e => e.currentTarget.style.color=WH} onMouseLeave={e => e.currentTarget.style.color="#86EFAC"}>
                    {l}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ borderTop:"1px solid rgba(255,255,255,.1)", paddingTop:20, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
            <div style={{ fontSize:12, color:"#6EE7B7" }}>© 2026 IMAP Bangladesh. {lang === "en" ? "All rights reserved." : "সর্বস্বত্ব সংরক্ষিত।"}</div>
            <div style={{ display:"flex", gap:16 }}>
              <button onClick={() => setLang && setLang(lang === "bn" ? "en" : "bn")}
                style={{ background:"rgba(255,255,255,.1)", border:"none", borderRadius:7, padding:"5px 12px", cursor:"pointer", fontSize:12, color:WH }}>
                {lang === "bn" ? "English" : "বাংলা"}
              </button>
              <button onClick={() => setDark && setDark(d => !d)}
                style={{ background:"rgba(255,255,255,.1)", border:"none", borderRadius:7, padding:"5px 12px", cursor:"pointer", fontSize:12, color:WH }}>
                {dark ? "☀️ Light" : "🌙 Dark"}
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ── FLOATING AI BUTTON ── */}
      {!aiOpen && (
        <button onClick={() => setAiOpen(true)}
          style={{ position:"fixed", bottom:28, right:18, width:56, height:56, borderRadius:16, background:`linear-gradient(135deg,${G},#0891B2)`, border:"none", cursor:"pointer", fontSize:24, boxShadow:"0 6px 24px rgba(22,163,74,.35)", zIndex:800, display:"flex", alignItems:"center", justifyContent:"center", transition:"transform .2s" }}
          onMouseEnter={e => e.currentTarget.style.transform="scale(1.1)"}
          onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}>
          🤖
        </button>
      )}

      {/* ── AI CHAT WIDGET ── */}
      {aiOpen && (
        <div style={{ position:"fixed", bottom:18, right:18, width:340, height:480, background:card, borderRadius:20, boxShadow:"0 20px 60px rgba(0,0,0,.22)", border:`1px solid ${bdr}`, zIndex:900, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Header */}
          <div style={{ background:`linear-gradient(135deg,${G},#0891B2)`, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:11, background:"rgba(255,255,255,.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🤖</div>
              <div>
                <div style={{ color:WH, fontWeight:700, fontSize:14 }}>{tr.aiTitle}</div>
                <div style={{ color:"rgba(255,255,255,.75)", fontSize:11 }}>{lang === "en" ? "Powered by IMAP AI" : "IMAP AI দ্বারা চালিত"}</div>
              </div>
            </div>
            <button onClick={() => setAiOpen(false)}
              style={{ background:"rgba(255,255,255,.2)", border:"none", borderRadius:8, width:30, height:30, cursor:"pointer", color:WH, fontSize:16 }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"16px 14px", display:"flex", flexDirection:"column", gap:12 }}>
            {aiChat.map((m, i) => (
              <div key={i} style={{ display:"flex", justifyContent: m.from==="user"?"flex-end":"flex-start" }}>
                <div className={m.from==="bot"?"ai-bubble-bot":"ai-bubble-user"} style={{ fontSize:13, lineHeight:1.6 }}>{m.text}</div>
              </div>
            ))}

            {/* Quick FAQ buttons */}
            {aiChat.length <= 2 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginTop:4 }}>
                {(lang === "en" ? FAQ_EN : FAQ_BN).slice(0,5).map((f, i) => (
                  <button key={i}
                    style={{ background: dark?"#1E3A2F":"#DCFCE7", border:`1px solid ${G}40`, borderRadius:20, padding:"5px 12px", fontSize:11, color:G, cursor:"pointer", fontWeight:600 }}
                    onClick={() => {
                      setAiChat(c => [...c, { from:"user", text:f.q }, { from:"bot", text:f.a }]);
                    }}>
                    {f.q}
                  </button>
                ))}
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>

          {/* Login prompt */}
          <div style={{ padding:"10px 14px", background: dark?"#1E3A2F":"#F0FDF4", borderTop:`1px solid ${bdr}`, fontSize:11, color:sub, textAlign:"center" }}>
            {lang === "en"
              ? <>Full AI access after <span style={{ color:G, cursor:"pointer", fontWeight:700 }} onClick={onGetStarted}>Login →</span></>
              : <>সম্পূর্ণ AI সহায়তার জন্য <span style={{ color:G, cursor:"pointer", fontWeight:700 }} onClick={onGetStarted}>লগইন করুন →</span></>}
          </div>

          {/* Input */}
          <div style={{ padding:"10px 12px", display:"flex", gap:8, borderTop:`1px solid ${bdr}` }}>
            <input
              value={aiMsg} onChange={e => setAiMsg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendAi()}
              placeholder={tr.aiPlaceholder}
              style={{ flex:1, border:`1.5px solid ${bdr}`, borderRadius:11, padding:"9px 13px", fontSize:13, background: dark?"#0F172A":WH, color:txt, outline:"none", fontFamily:"inherit" }}
            />
            <button onClick={sendAi}
              style={{ background:G, border:"none", borderRadius:11, width:40, height:40, cursor:"pointer", fontSize:18, color:WH, flexShrink:0 }}>➤</button>
          </div>
        </div>
      )}

      {/* ── MOBILE STICKY LOGIN BAR (always visible on phones) ── */}
      {isMob && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:800, background:card, borderTop:`2px solid ${G}`, padding:"10px 16px", display:"flex", gap:10, boxShadow:"0 -4px 20px rgba(22,163,74,.15)" }}>
          <button className="lp-btn lp-btn-o" style={{ flex:1, fontSize:14, padding:"11px 0" }} onClick={onGetStarted}>{tr.loginBtn}</button>
          <button className="lp-btn lp-btn-g" style={{ flex:1, fontSize:14, padding:"12px 0" }} onClick={onGetStarted}>{tr.regBtn}</button>
        </div>
      )}
    </div>
  );
}

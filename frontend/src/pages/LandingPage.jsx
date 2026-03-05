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

        /* ── Premium Animations ── */
        @keyframes lp-shimmer{0%{background-position:200% center}100%{background-position:-200% center}}
        @keyframes lp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes lp-glow{0%,100%{box-shadow:0 0 20px ${G}33}50%{box-shadow:0 0 40px ${G}66}}
        @keyframes lp-fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes lp-pulse-ring{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.6);opacity:0}}
        @keyframes lp-spin-slow{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes lp-gradient{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}

        /* ── Base Button ── */
        .lp-btn{
          border:none;cursor:pointer;font-family:inherit;
          transition:all .22s cubic-bezier(.16,1,.3,1);
          border-radius:14px;font-weight:700;position:relative;overflow:hidden;
        }
        .lp-btn::after{
          content:'';position:absolute;inset:0;
          background:linear-gradient(135deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,0) 60%);
          pointer-events:none;border-radius:14px;
        }

        /* ── Primary Button ── */
        .lp-btn-g{
          background:linear-gradient(135deg,#22D47F 0%,${G} 50%,${GD} 100%);
          background-size:200%;
          color:#fff;padding:13px 30px;
          box-shadow:0 6px 20px ${G}55,0 2px 6px rgba(0,0,0,.12),inset 0 1px 0 rgba(255,255,255,.25);
        }
        .lp-btn-g:hover{
          background-position:right center;
          transform:translateY(-3px) scale(1.02);
          box-shadow:0 12px 32px ${G}66,0 4px 12px rgba(0,0,0,.15),inset 0 1px 0 rgba(255,255,255,.3);
        }
        .lp-btn-g:active{transform:scale(.97);box-shadow:0 4px 12px ${G}44;}

        /* ── Outline Button ── */
        .lp-btn-o{
          background:${dark?"rgba(14,31,24,.7)":"rgba(255,255,255,.8)"};
          color:${G};border:2px solid ${G};padding:12px 28px;
          backdrop-filter:blur(2px);
          box-shadow:0 2px 10px ${G}22,inset 0 1px 0 rgba(255,255,255,.6);
        }
        .lp-btn-o:hover{
          background:${dark?`rgba(34,212,127,.15)`:GBG};
          box-shadow:0 6px 20px ${G}33,inset 0 1px 0 rgba(255,255,255,.8);
          transform:translateY(-2px);
        }

        /* ── Small Button ── */
        .lp-btn-sm{
          background:linear-gradient(135deg,${G},${GD});color:#fff;
          padding:8px 18px;font-size:13px;border-radius:10px;border:none;cursor:pointer;font-weight:700;
          box-shadow:0 3px 10px ${G}44,inset 0 1px 0 rgba(255,255,255,.2);
          transition:all .2s;position:relative;overflow:hidden;
        }
        .lp-btn-sm:hover{transform:translateY(-1px);box-shadow:0 6px 16px ${G}55;}

        /* ── Glass Service Card ── */
        .svc-card{
          padding:20px 16px;border-radius:20px;
          border:1px solid ${dark?"rgba(30,69,53,.7)":"rgba(255,255,255,.8)"};
          background:${dark?"rgba(14,31,24,.8)":"rgba(255,255,255,.85)"};
          backdrop-filter:blur(2px) saturate(120%);
          -webkit-backdrop-filter:blur(2px) saturate(120%);
          cursor:pointer;transition:all .28s cubic-bezier(.16,1,.3,1);text-align:center;
          box-shadow:0 4px 16px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.7);
        }
        .svc-card:hover{
          transform:translateY(-6px) scale(1.03);
          box-shadow:0 20px 48px rgba(22,163,74,.18),0 0 0 1px ${G}33,inset 0 1px 0 rgba(255,255,255,.9);
          border-color:${G}55;
        }

        /* ── Trust Cards ── */
        .trust-card{
          padding:22px;border-radius:18px;
          background:${dark?"rgba(14,31,24,.8)":"rgba(255,255,255,.85)"};
          border:1px solid ${dark?"rgba(30,69,53,.6)":"rgba(255,255,255,.8)"};
          backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);
          box-shadow:0 4px 16px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.6);
          transition:all .25s cubic-bezier(.16,1,.3,1);
        }
        .trust-card:hover{
          transform:translateY(-4px);
          box-shadow:0 16px 40px rgba(22,163,74,.14),0 0 0 1px ${G}22;
          border-color:${G}44;
        }

        /* ── AI Chat Bubbles ── */
        .ai-bubble-bot{
          background:${dark?"linear-gradient(135deg,rgba(30,58,47,.9),rgba(20,50,36,.9))":"linear-gradient(135deg,#DCFCE7,#BBF7D0)"};
          border-radius:18px 18px 18px 4px;padding:13px 17px;max-width:88%;
          word-break:break-word;color:${txt};
          box-shadow:0 2px 10px rgba(22,163,74,.12),inset 0 1px 0 rgba(255,255,255,.3);
          border:1px solid ${dark?"rgba(34,212,127,.15)":"rgba(22,163,74,.15)"};
        }
        .ai-bubble-user{
          background:linear-gradient(135deg,${G},${GD});
          color:#fff;border-radius:18px 18px 4px 18px;padding:13px 17px;max-width:88%;
          word-break:break-word;margin-left:auto;
          box-shadow:0 4px 14px ${G}44,inset 0 1px 0 rgba(255,255,255,.2);
        }

        /* ── Contact Buttons ── */
        .contact-btn{
          display:flex;align-items:center;gap:14px;padding:17px 22px;
          border-radius:16px;
          border:1px solid ${dark?"rgba(30,69,53,.6)":"rgba(255,255,255,.8)"};
          background:${dark?"rgba(14,31,24,.8)":"rgba(255,255,255,.85)"};
          backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
          cursor:pointer;transition:all .22s cubic-bezier(.16,1,.3,1);
          text-decoration:none;color:${txt};
          box-shadow:0 2px 10px rgba(0,0,0,.05),inset 0 1px 0 rgba(255,255,255,.6);
        }
        .contact-btn:hover{
          border-color:${G}55;
          box-shadow:0 8px 28px rgba(22,163,74,.16),0 0 0 1px ${G}22;
          transform:translateY(-3px);
          background:${dark?"rgba(34,212,127,.08)":"rgba(240,253,244,.95)"};
        }

        /* ── FAQ ── */
        .lp-faq-item{
          border-radius:16px;border:1px solid ${dark?"rgba(30,69,53,.5)":"rgba(214,236,227,.8)"};
          background:${dark?"rgba(14,31,24,.7)":"rgba(255,255,255,.8)"};
          backdrop-filter:blur(3px);overflow:hidden;
          transition:all .2s;
          box-shadow:0 2px 8px rgba(0,0,0,.04);
        }
        .lp-faq-item:hover{border-color:${G}44;box-shadow:0 6px 20px rgba(22,163,74,.1);}

        /* ── Responsive ── */
        @media(max-width:640px){
          .lp-grid{grid-template-columns:repeat(3,1fr)!important}
          .lp-how{grid-template-columns:repeat(2,1fr)!important}
          .lp-trust{grid-template-columns:repeat(2,1fr)!important}
          .lp-contact{grid-template-columns:1fr!important}
          .lp-hero-btns{flex-direction:column!important}
          .svc-card:hover{transform:none}
          .trust-card:hover{transform:none}
        }
      `}</style>

      {/* ── TOP NAV ── */}
      <nav style={{
        background: dark ? "rgba(8,15,11,.88)" : "rgba(255,255,255,.88)",
        backdropFilter:"blur(6px) saturate(130%)",
        WebkitBackdropFilter:"blur(6px) saturate(130%)",
        borderBottom:`1px solid ${dark?"rgba(30,69,53,.6)":"rgba(255,255,255,.7)"}`,
        position:"sticky", top:0, zIndex:900,
        boxShadow: dark
          ? "0 2px 20px rgba(0,0,0,.3),inset 0 -1px 0 rgba(34,212,127,.08)"
          : "0 2px 20px rgba(0,0,0,.06),inset 0 -1px 0 rgba(255,255,255,.8)"
      }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 20px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
            <div style={{
              width:38, height:38, borderRadius:12,
              background:`linear-gradient(135deg,${G},${GD})`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:19,
              boxShadow:`0 4px 14px ${G}55,inset 0 1px 0 rgba(255,255,255,.25)`
            }}>🌿</div>
            <div>
              <div style={{
                fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:19, fontWeight:800, lineHeight:1,
                background:`linear-gradient(135deg,${G},${GD})`,
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text"
              }}>IMAP</div>
              <div style={{ fontSize:9, color:sub, letterSpacing:1.4, textTransform:"uppercase", opacity:.8 }}>AI Powered Service</div>
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
      <section style={{
        background: dark
          ? "linear-gradient(155deg,#061008 0%,#0A1F12 40%,#0D2E22 70%,#061810 100%)"
          : "linear-gradient(155deg,#0B3A1F 0%,#145232 40%,#1A6040 70%,#0D4228 100%)",
        padding:"88px 20px 100px", position:"relative", overflow:"hidden"
      }}>
        {/* Decorative orbs */}
        <div style={{ position:"absolute", right:-120, top:-120, width:520, height:520, borderRadius:"50%", background:`radial-gradient(circle,${G}18 0%,transparent 70%)`, pointerEvents:"none", animation:"lp-float 6s ease-in-out infinite" }}/>
        <div style={{ position:"absolute", left:-80, bottom:-80, width:360, height:360, borderRadius:"50%", background:`radial-gradient(circle,${G}12 0%,transparent 70%)`, pointerEvents:"none", animation:"lp-float 8s ease-in-out infinite reverse" }}/>
        <div style={{ position:"absolute", left:"50%", top:"30%", width:200, height:200, borderRadius:"50%", background:`radial-gradient(circle,rgba(255,255,255,.04) 0%,transparent 70%)`, pointerEvents:"none", transform:"translateX(-50%)" }}/>
        {/* Mesh grid overlay */}
        <div style={{ position:"absolute", inset:0, backgroundImage:`linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px)`, backgroundSize:"40px 40px", pointerEvents:"none" }}/>

        <div style={{ maxWidth:800, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          {/* Badge */}
          <div style={{
            display:"inline-flex", alignItems:"center", gap:8,
            background:"rgba(255,255,255,.1)",
            backdropFilter:"blur(3px)", WebkitBackdropFilter:"blur(3px)",
            borderRadius:30, padding:"7px 20px", fontSize:12, color:"#86efac",
            marginBottom:24, border:"1px solid rgba(255,255,255,.18)",
            boxShadow:"0 4px 16px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.15)"
          }}>
            🇧🇩 &nbsp;Bangladesh's Trusted Service Platform
          </div>
          <h1 style={{
            fontFamily:"'Plus Jakarta Sans',sans-serif",
            fontSize: isMob ? 30 : 46, fontWeight:800, color:WH, lineHeight:1.22, marginBottom:18,
            textShadow:"0 2px 20px rgba(0,0,0,.3)"
          }}>
            {tr.tagline}
          </h1>
          <p style={{ fontSize:16, color:"#86efac", marginBottom:40, lineHeight:1.75, opacity:.92 }}>{tr.sub}</p>

          {/* Stats bar */}
          <div style={{ display:"flex", justifyContent:"center", gap:0, marginBottom:44, flexWrap:"wrap" }}>
            {[["500+", lang==="en"?"Services":"সেবা"], ["10K+", lang==="en"?"Customers":"গ্রাহক"], ["1200+", lang==="en"?"Providers":"Provider"], ["4.8★", lang==="en"?"Rating":"রেটিং"]].map(([v,l],i,arr) => (
              <div key={l} style={{
                textAlign:"center", padding:"12px 28px",
                borderRight: i<arr.length-1 ? "1px solid rgba(255,255,255,.12)" : "none"
              }}>
                <div style={{ fontSize:24, fontWeight:800, color:WH, fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:-.5 }}>{v}</div>
                <div style={{ fontSize:11, color:"#86efac", marginTop:3, letterSpacing:.5 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="lp-hero-btns" style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
            <button className="lp-btn" style={{
              background:"rgba(255,255,255,.95)", color:G, fontSize:15, padding:"15px 38px",
              borderRadius:14, fontWeight:800,
              boxShadow:"0 8px 28px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,1)"
            }} onClick={onGetStarted}>
              🛍️ {tr.bookBtn}
            </button>
            <button className="lp-btn" style={{
              background:"rgba(255,255,255,.1)", color:WH, border:"1.5px solid rgba(255,255,255,.35)",
              fontSize:15, padding:"14px 36px", borderRadius:14, fontWeight:700,
              backdropFilter:"blur(2px)", WebkitBackdropFilter:"blur(2px)",
              boxShadow:"0 4px 20px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.15)"
            }} onClick={onRegisterProvider}>
              👷 {tr.provBtn}
            </button>
            <button className="lp-btn" style={{
              background:"rgba(255,255,255,.08)", color:WH, fontSize:14, padding:"13px 28px",
              borderRadius:14, border:"1px solid rgba(255,255,255,.18)",
              backdropFilter:"blur(2px)", WebkitBackdropFilter:"blur(2px)"
            }} onClick={() => setAiOpen(true)}>
              🤖 {lang === "en" ? "Ask AI" : "AI-কে জিজ্ঞেস করুন"}
            </button>
          </div>

          {/* Trust badges */}
          <div style={{ marginTop:36, display:"flex", justifyContent:"center", gap:12, flexWrap:"wrap" }}>
            {["✅ KYC Verified", "🔒 Secure Payment", "🆘 SOS Protected", "⚖️ Legal Shield"].map(b => (
              <div key={b} style={{
                fontSize:11, color:"rgba(255,255,255,.8)", display:"flex", alignItems:"center", gap:6,
                background:"rgba(255,255,255,.08)", backdropFilter:"blur(2px)", WebkitBackdropFilter:"blur(2px)",
                border:"1px solid rgba(255,255,255,.14)", borderRadius:30,
                padding:"5px 14px", fontWeight:600,
                boxShadow:"inset 0 1px 0 rgba(255,255,255,.1)"
              }}>{b}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section style={{
        padding:"72px 20px",
        background: dark
          ? "linear-gradient(180deg,#080F0B 0%,#0A1812 100%)"
          : "linear-gradient(180deg,#F0F7F3 0%,#F8FFFA 100%)"
      }}>
        <div style={{ maxWidth:1200, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:40 }}>
            <div style={{
              display:"inline-block", fontSize:11, letterSpacing:2, color:G, fontWeight:700,
              textTransform:"uppercase", marginBottom:10,
              background: dark?"rgba(34,212,127,.1)":"rgba(22,163,74,.08)",
              border:`1px solid ${G}33`, borderRadius:30, padding:"4px 16px"
            }}>500+ সেবা</div>
            <h2 style={{
              fontSize:30, fontWeight:800, marginBottom:8,
              background:`linear-gradient(135deg,${txt},${G})`,
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text"
            }}>{tr.svcTitle}</h2>
            <p style={{ color:sub, fontSize:14 }}>{tr.svcSub}</p>
          </div>
          <div className="lp-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
            {CATS.map(c => (
              <div key={c.name} className="svc-card" onClick={onGetStarted} style={{
                borderTop:`3px solid ${c.col}`,
                boxShadow:`0 4px 16px ${c.col}15,inset 0 1px 0 rgba(255,255,255,.7)`
              }}>
                <div style={{ fontSize:34, marginBottom:10, filter:`drop-shadow(0 2px 6px ${c.col}44)` }}>{c.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color:txt, lineHeight:1.35, marginBottom:5 }}>{lang === "en" ? c.nameEn : c.name}</div>
                <div style={{ fontSize:11, color:G, fontWeight:700, background:`${G}15`, borderRadius:30, padding:"2px 10px", display:"inline-block" }}>{c.price}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:"center", marginTop:32 }}>
            <button className="lp-btn lp-btn-g" onClick={onGetStarted} style={{ fontSize:14, padding:"13px 36px" }}>
              {lang === "en" ? "View All Services →" : "সব সেবা দেখুন →"}
            </button>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{
        padding:"72px 20px",
        background: dark
          ? "linear-gradient(180deg,#0A1812 0%,#0D2010 100%)"
          : "linear-gradient(180deg,#FFFFFF 0%,#F6FDF9 100%)"
      }}>
        <div style={{ maxWidth:900, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:44 }}>
            <div style={{
              display:"inline-block", fontSize:11, letterSpacing:2, color:G, fontWeight:700,
              textTransform:"uppercase", marginBottom:10,
              background: dark?"rgba(34,212,127,.1)":"rgba(22,163,74,.08)",
              border:`1px solid ${G}33`, borderRadius:30, padding:"4px 16px"
            }}>Simple Process</div>
            <h2 style={{
              fontSize:30, fontWeight:800,
              background:`linear-gradient(135deg,${txt},${G})`,
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text"
            }}>{tr.howTitle}</h2>
          </div>
          <div className="lp-how" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:20 }}>
            {HOW.map((h, i) => (
              <div key={i} style={{
                textAlign:"center", padding:"28px 18px 22px", position:"relative",
                borderRadius:20,
                background: dark?"rgba(14,31,24,.8)":"rgba(255,255,255,.85)",
                backdropFilter:"blur(2px)", WebkitBackdropFilter:"blur(2px)",
                border:`1px solid ${dark?"rgba(30,69,53,.6)":"rgba(255,255,255,.8)"}`,
                boxShadow:`0 4px 20px rgba(0,0,0,.06),0 0 0 1px ${G}11,inset 0 1px 0 rgba(255,255,255,.7)`,
                transition:"all .25s cubic-bezier(.16,1,.3,1)"
              }}>
                <div style={{
                  position:"absolute", top:-14, left:"50%", transform:"translateX(-50%)",
                  width:30, height:30, borderRadius:"50%",
                  background:`linear-gradient(135deg,${G},${GD})`,
                  color:WH, fontWeight:800, fontSize:13,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  boxShadow:`0 4px 12px ${G}55,inset 0 1px 0 rgba(255,255,255,.3)`
                }}>{i+1}</div>
                <div style={{ fontSize:42, marginBottom:12, marginTop:8, filter:`drop-shadow(0 4px 8px rgba(0,0,0,.15))` }}>{h.icon}</div>
                <div style={{ fontWeight:800, fontSize:14, marginBottom:7, color:txt }}>{h.t}</div>
                <div style={{ fontSize:12, color:sub, lineHeight:1.6 }}>{h.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST PILLARS ── */}
      <section style={{
        padding:"72px 20px",
        background: dark
          ? "linear-gradient(180deg,#0D2010 0%,#080F0B 100%)"
          : "linear-gradient(180deg,#F0FDF4 0%,#F6FFF9 100%)"
      }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:44 }}>
            <div style={{
              display:"inline-block", fontSize:11, letterSpacing:2, color:G, fontWeight:700,
              textTransform:"uppercase", marginBottom:10,
              background: dark?"rgba(34,212,127,.1)":"rgba(22,163,74,.08)",
              border:`1px solid ${G}33`, borderRadius:30, padding:"4px 16px"
            }}>Trust & Safety</div>
            <h2 style={{
              fontSize:30, fontWeight:800,
              background:`linear-gradient(135deg,${txt},${G})`,
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text"
            }}>{tr.trustTitle}</h2>
          </div>
          <div className="lp-trust" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {TRUST.map((t, i) => (
              <div key={i} className="trust-card">
                <div style={{ fontSize:32, marginBottom:12, filter:"drop-shadow(0 2px 6px rgba(0,0,0,.12))" }}>{t.icon}</div>
                <div style={{ fontWeight:800, fontSize:15, marginBottom:7, color:txt }}>{t.t}</div>
                <div style={{ fontSize:12, color:sub, lineHeight:1.65 }}>{t.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SAFETY + SOS SECTION ── */}
      <section style={{
        padding:"72px 20px",
        background: dark
          ? "linear-gradient(180deg,#080F0B 0%,#100808 100%)"
          : "linear-gradient(180deg,#FFF7F7 0%,#FFF1F0 100%)"
      }}>
        <div style={{ maxWidth:900, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:44 }}>
            <div style={{
              display:"inline-block", fontSize:11, letterSpacing:2, color:"#EF4444", fontWeight:700,
              textTransform:"uppercase", marginBottom:10,
              background: dark?"rgba(239,68,68,.1)":"rgba(239,68,68,.08)",
              border:"1px solid rgba(239,68,68,.25)", borderRadius:30, padding:"4px 16px"
            }}>🛡️ Security First</div>
            <h2 style={{
              fontSize:30, fontWeight:800,
              background:`linear-gradient(135deg,${txt},#EF4444)`,
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text"
            }}>{tr.safetyTitle}</h2>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            {/* SOS Card */}
            <div style={{
              background: dark?"rgba(45,21,21,.85)":"rgba(254,242,242,.9)",
              backdropFilter:"blur(2px)", WebkitBackdropFilter:"blur(2px)",
              border:"1.5px solid rgba(252,165,165,.5)", borderRadius:20, padding:28,
              boxShadow:"0 8px 32px rgba(239,68,68,.1),inset 0 1px 0 rgba(255,255,255,.15)"
            }}>
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
            <div style={{
              background: dark?"rgba(26,26,48,.85)":"rgba(238,242,255,.9)",
              backdropFilter:"blur(2px)", WebkitBackdropFilter:"blur(2px)",
              border:"1.5px solid rgba(165,180,252,.45)", borderRadius:20, padding:28,
              boxShadow:"0 8px 32px rgba(99,102,241,.1),inset 0 1px 0 rgba(255,255,255,.12)"
            }}>
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
            <div style={{
              background: dark?"rgba(13,32,24,.85)":"rgba(220,252,231,.9)",
              backdropFilter:"blur(2px)", WebkitBackdropFilter:"blur(2px)",
              border:"1.5px solid rgba(134,239,172,.4)", borderRadius:20, padding:28,
              boxShadow:"0 8px 32px rgba(21,128,61,.1),inset 0 1px 0 rgba(255,255,255,.15)"
            }}>
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
            <div style={{
              background: dark?"rgba(26,21,32,.85)":"rgba(250,245,255,.9)",
              backdropFilter:"blur(2px)", WebkitBackdropFilter:"blur(2px)",
              border:"1.5px solid rgba(216,180,254,.4)", borderRadius:20, padding:28,
              boxShadow:"0 8px 32px rgba(124,58,237,.1),inset 0 1px 0 rgba(255,255,255,.12)"
            }}>
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
      <section style={{
        padding:"72px 20px",
        background: dark
          ? "linear-gradient(180deg,#100808 0%,#080F0B 100%)"
          : "linear-gradient(180deg,#FFFFFF 0%,#F6FDF9 100%)"
      }}>
        <div style={{ maxWidth:800, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:44 }}>
            <div style={{
              display:"inline-block", fontSize:11, letterSpacing:2, color:G, fontWeight:700,
              textTransform:"uppercase", marginBottom:10,
              background: dark?"rgba(34,212,127,.1)":"rgba(22,163,74,.08)",
              border:`1px solid ${G}33`, borderRadius:30, padding:"4px 16px"
            }}>Live Support</div>
            <h2 style={{
              fontSize:30, fontWeight:800,
              background:`linear-gradient(135deg,${txt},${G})`,
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text"
            }}>{tr.contactTitle}</h2>
            <p style={{ color:sub, fontSize:14, marginTop:10 }}>
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
          <div style={{
            marginTop:24, padding:"18px 24px",
            borderRadius:18,
            background: dark?"rgba(26,10,10,.85)":"rgba(255,241,242,.9)",
            backdropFilter:"blur(3px)", WebkitBackdropFilter:"blur(3px)",
            border:"1.5px solid rgba(252,165,165,.4)",
            display:"flex", alignItems:"center", gap:16,
            boxShadow:"0 4px 20px rgba(239,68,68,.08),inset 0 1px 0 rgba(255,255,255,.2)"
          }}>
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
      <footer style={{
        background: dark
          ? "linear-gradient(180deg,#060D08 0%,#030806 100%)"
          : `linear-gradient(155deg,#0B3A1F 0%,${GD} 50%,#0D4228 100%)`,
        padding:"56px 20px 28px",
        position:"relative", overflow:"hidden"
      }}>
        {/* Footer mesh overlay */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)", backgroundSize:"40px 40px", pointerEvents:"none" }}/>
        <div style={{ maxWidth:1100, margin:"0 auto", position:"relative", zIndex:1 }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:32, marginBottom:40 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <div style={{
                  width:38, height:38, borderRadius:12,
                  background:`linear-gradient(135deg,${G},#0891B2)`,
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:19,
                  boxShadow:`0 4px 14px ${G}55,inset 0 1px 0 rgba(255,255,255,.25)`
                }}>🌿</div>
                <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:19, fontWeight:800, color:WH, letterSpacing:-.3 }}>IMAP</div>
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
          <div style={{ borderTop:"1px solid rgba(255,255,255,.08)", paddingTop:22, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
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
          style={{
            position:"fixed", bottom:28, right:18, width:58, height:58, borderRadius:18,
            background:`linear-gradient(135deg,${G},#0891B2)`,
            border:"1.5px solid rgba(255,255,255,.2)",
            cursor:"pointer", fontSize:26,
            boxShadow:`0 8px 28px ${G}55,0 4px 12px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.25)`,
            zIndex:800, display:"flex", alignItems:"center", justifyContent:"center",
            transition:"all .22s cubic-bezier(.16,1,.3,1)"
          }}
          onMouseEnter={e => { e.currentTarget.style.transform="scale(1.12) translateY(-2px)"; e.currentTarget.style.boxShadow=`0 14px 36px ${G}66,0 6px 16px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.3)`; }}
          onMouseLeave={e => { e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.boxShadow=`0 8px 28px ${G}55,0 4px 12px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.25)`; }}>
          🤖
        </button>
      )}

      {/* ── AI CHAT WIDGET ── */}
      {aiOpen && (
        <div style={{
          position:"fixed", bottom:18, right:18, width:348, height:488,
          background: dark?"rgba(10,22,16,.96)":"rgba(255,255,255,.96)",
          backdropFilter:"blur(6px) saturate(130%)", WebkitBackdropFilter:"blur(6px) saturate(130%)",
          borderRadius:24,
          boxShadow:`0 32px 80px rgba(0,0,0,.28),0 8px 24px rgba(0,0,0,.14),0 0 0 1px ${G}22,inset 0 1px 0 rgba(255,255,255,.15)`,
          border:`1px solid ${dark?"rgba(30,69,53,.5)":"rgba(255,255,255,.7)"}`,
          zIndex:900, display:"flex", flexDirection:"column", overflow:"hidden"
        }}>
          {/* Header */}
          <div style={{
            background:`linear-gradient(135deg,#0D7A4A,${G},#0891B2)`,
            backgroundSize:"200%",
            padding:"15px 18px",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            boxShadow:"0 4px 16px rgba(0,0,0,.15)"
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{
                width:36, height:36, borderRadius:12,
                background:"rgba(255,255,255,.18)",
                backdropFilter:"blur(2px)",
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:19,
                border:"1px solid rgba(255,255,255,.25)"
              }}>🤖</div>
              <div>
                <div style={{ color:WH, fontWeight:700, fontSize:14 }}>{tr.aiTitle}</div>
                <div style={{ color:"rgba(255,255,255,.75)", fontSize:11 }}>{lang === "en" ? "Powered by IMAP AI" : "IMAP AI দ্বারা চালিত"}</div>
              </div>
            </div>
            <button onClick={() => setAiOpen(false)}
              style={{
                background:"rgba(255,255,255,.18)", border:"1px solid rgba(255,255,255,.2)",
                borderRadius:10, width:32, height:32,
                cursor:"pointer", color:WH, fontSize:16,
                backdropFilter:"blur(2px)",
                display:"flex", alignItems:"center", justifyContent:"center"
              }}>✕</button>
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
          <div style={{
            padding:"10px 14px",
            background: dark?"rgba(14,31,24,.8)":"rgba(240,253,244,.9)",
            borderTop:`1px solid ${dark?"rgba(30,69,53,.4)":"rgba(214,236,227,.6)"}`,
            fontSize:11, color:sub, textAlign:"center"
          }}>
            {lang === "en"
              ? <>Full AI access after <span style={{ color:G, cursor:"pointer", fontWeight:700 }} onClick={onGetStarted}>Login →</span></>
              : <>সম্পূর্ণ AI সহায়তার জন্য <span style={{ color:G, cursor:"pointer", fontWeight:700 }} onClick={onGetStarted}>লগইন করুন →</span></>}
          </div>

          {/* Input */}
          <div style={{
            padding:"10px 12px", display:"flex", gap:8,
            borderTop:`1px solid ${dark?"rgba(30,69,53,.4)":"rgba(214,236,227,.6)"}`
          }}>
            <input
              value={aiMsg} onChange={e => setAiMsg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendAi()}
              placeholder={tr.aiPlaceholder}
              style={{
                flex:1,
                border:`1.5px solid ${dark?"rgba(30,69,53,.7)":"rgba(214,236,227,.8)"}`,
                borderRadius:12, padding:"9px 14px", fontSize:13,
                background: dark?"rgba(8,15,11,.8)":"rgba(255,255,255,.9)",
                color:txt, outline:"none", fontFamily:"inherit",
                backdropFilter:"blur(2px)"
              }}
            />
            <button onClick={sendAi}
              style={{
                background:`linear-gradient(135deg,${G},#0EA5E9)`,
                border:"none", borderRadius:12, width:42, height:42,
                cursor:"pointer", fontSize:17, color:WH, flexShrink:0,
                boxShadow:`0 4px 12px ${G}44`,
                display:"flex", alignItems:"center", justifyContent:"center"
              }}>➤</button>
          </div>
        </div>
      )}

      {/* ── MOBILE STICKY LOGIN BAR (always visible on phones) ── */}
      {isMob && (
        <div style={{
          position:"fixed", bottom:0, left:0, right:0, zIndex:800,
          background: dark?"rgba(8,15,11,.94)":"rgba(255,255,255,.94)",
          backdropFilter:"blur(5px) saturate(120%)", WebkitBackdropFilter:"blur(5px) saturate(120%)",
          borderTop:`2px solid ${G}44`,
          borderRadius:"20px 20px 0 0",
          padding:"12px 16px", display:"flex", gap:10,
          boxShadow:`0 -8px 32px rgba(22,163,74,.18),inset 0 1px 0 rgba(255,255,255,.4)`
        }}>
          <button className="lp-btn lp-btn-o" style={{ flex:1, fontSize:14, padding:"11px 0" }} onClick={onGetStarted}>{tr.loginBtn}</button>
          <button className="lp-btn lp-btn-g" style={{ flex:1, fontSize:14, padding:"12px 0" }} onClick={onGetStarted}>{tr.regBtn}</button>
        </div>
      )}
    </div>
  );
}

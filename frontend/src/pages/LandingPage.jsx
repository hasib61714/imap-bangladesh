import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════
   IMAP Bangladesh — LandingPage
   Design: Red Data–style clean sections · Bangladesh flag colours
   Light: white bg · BD green #006A4E · BD red #E8192C
   Dark : #0A100E bg · green #00C170 · red #FF4D5E — full contrast
═══════════════════════════════════════════════════════════════════ */
export default function LandingPage({ dark = false, setDark, lang = "bn", setLang, onGetStarted, onRegisterProvider }) {

  /* ─────────── STATIC DATA ─────────── */
  const CATS = [
    { icon:"🚨", nameBn:"জরুরি সেবা",         nameEn:"Emergency",        col:"#E8192C", priceEn:"Free",      priceBn:"বিনামূল্যে" },
    { icon:"🏠", nameBn:"গৃহ রক্ষণাবেক্ষণ",   nameEn:"Home Maintenance", col:"#F59E0B", priceEn:"From ৳350", priceBn:"৳৩৫০ থেকে" },
    { icon:"🧹", nameBn:"পরিষ্কার সেবা",      nameEn:"Cleaning",         col:"#14B8A6", priceEn:"From ৳400", priceBn:"৳৪০০ থেকে" },
    { icon:"👩‍⚕️", nameBn:"স্বাস্থ্যসেবা",      nameEn:"Healthcare",       col:"#EF4444", priceEn:"From ৳500", priceBn:"৳৫০০ থেকে" },
    { icon:"📚", nameBn:"শিক্ষা সেবা",        nameEn:"Education",        col:"#8B5CF6", priceEn:"From ৳400", priceBn:"৳৪০০ থেকে" },
    { icon:"🚚", nameBn:"স্থানান্তর",          nameEn:"Moving Services",  col:"#F97316", priceEn:"From ৳2000",priceBn:"৳২০০০ থেকে" },
    { icon:"🍲", nameBn:"রান্না ও খাবার",      nameEn:"Food & Cooking",   col:"#F59E0B", priceEn:"From ৳600", priceBn:"৳৬০০ থেকে" },
    { icon:"🧑‍💼", nameBn:"পেশাদার পরামর্শ",   nameEn:"Professional",     col:"#6366F1", priceEn:"From ৳800", priceBn:"৳৮০০ থেকে" },
    { icon:"🛡️", nameBn:"নিরাপত্তা সেবা",    nameEn:"Security",         col:"#374151", priceEn:"From ৳500", priceBn:"৳৫০০ থেকে" },
    { icon:"🛒", nameBn:"দৈনন্দিন সহায়তা",  nameEn:"Daily Errands",    col:"#EC4899", priceEn:"From ৳150", priceBn:"৳১৫০ থেকে" },
    { icon:"🧓", nameBn:"বয়স্ক সেবা",        nameEn:"Elderly Care",     col:"#7C3AED", priceEn:"From ৳400", priceBn:"৳৪০০ থেকে" },
    { icon:"👶", nameBn:"শিশু ও পরিবার",     nameEn:"Child & Family",   col:"#DB2777", priceEn:"From ৳400", priceBn:"৳৪০০ থেকে" },
  ];

  const FAQ_DATA = {
    bn: [
      { q:"সেবার দাম কত?",           a:"আমাদের সেবা শুরু হয় মাত্র ৳১৫০ থেকে। জরুরি সেবা সম্পূর্ণ বিনামূল্যে। প্রতিটি সেবার নির্দিষ্ট মূল্য সার্ভিস পেজে দেখা যায়।" },
      { q:"কিভাবে বুক করব?",         a:"লগইন করুন → সেবা বেছে নিন → কাছের Provider দেখুন → সময় ও মূল্য নিশ্চিত করুন → বুকিং কনফার্ম করুন। Provider নির্ধারিত সময়ে আসবেন।" },
      { q:"Provider হব কিভাবে?",     a:"'Service Provider' হিসেবে Register করুন → NID ও প্রয়োজনীয় কাগজ আপলোড করুন (KYC) → ৪৮ ঘণ্টার মধ্যে Approval → কাজ শুরু করুন ও আয় করুন!" },
      { q:"এটা কি নিরাপদ?",          a:"অবশ্যই! প্রতিটি Provider KYC-যাচাইকৃত ও NID-ভেরিফাইড। সেবা চলাকালীন SOS বাটন সক্রিয়। যেকোনো ঘটনায় তাৎক্ষণিক Admin ও Call Center সতর্ক হয়।" },
      { q:"Payment কিভাবে করব?",     a:"Cash on Delivery, bKash, Nagad ও Card — সব গ্রহণযোগ্য। সমস্ত লেনদেন সম্পূর্ণ এনক্রিপ্টেড ও নিরাপদ।" },
      { q:"সেবা বাতিল করতে পারব?",   a:"Service শুরুর ২ ঘণ্টা আগে বাতিল করলে সম্পূর্ণ Refund। ১ ঘণ্টার কম সময়ে ৫০% চার্জ। Provider বাতিল করলে কোনো চার্জ নেই।" },
    ],
    en: [
      { q:"What are the prices?",       a:"Services start from just ৳150. Emergency services are completely free. Exact pricing is shown on each service page." },
      { q:"How do I book a service?",   a:"Login → Choose a service → Browse nearby Providers → Confirm time & price → Book. Provider will arrive at the scheduled time." },
      { q:"How to become a Provider?",  a:"Register as 'Service Provider' → Upload NID & documents (KYC) → Get approval within 48 hours → Start earning!" },
      { q:"Is it safe?",                a:"Absolutely! Every Provider is KYC-verified with NID. The SOS button is always active during service. Our Admin & Call Center are instantly alerted of any incident." },
      { q:"How to pay?",                a:"Cash on Delivery, bKash, Nagad and Card — all accepted. All transactions are fully encrypted and secure." },
      { q:"Can I cancel a booking?",    a:"Full refund if cancelled 2+ hours before service. 50% charge within 1 hour. No charge if Provider cancels." },
    ],
  };

  const TESTIMONIALS = {
    bn: [
      { name:"রহিমা বেগম",    role:"গৃহিণী, ঢাকা",           initials:"রব", text:"IMAP-এর মাধ্যমে ঘরে বসেই দ্রুত Plumber পেয়েছি। Provider সময়মতো এসেছেন, কাজও ভালো হয়েছে। সম্পূর্ণ নিরাপদ অনুভব করেছি।" },
      { name:"তানভীর আহমেদ", role:"ব্যবসায়ী, চট্টগ্রাম",   initials:"তআ", text:"AC সার্ভিসিং এর জন্য IMAP ব্যবহার করেছি। দাম সাশ্রয়ী, KYC-ভেরিফাইড প্রফেশনাল এসেছেন। আর কোনো ঝামেলা নেই।" },
      { name:"নাসরিন আক্তার", role:"চাকরিজীবী, সিলেট",     initials:"নআ", text:"বয়স্ক মায়ের জন্য Homecare নিয়েছিলাম। অত্যন্ত যত্নশীল Provider! IMAP-এর SOS ফিচারটা মনে অনেক শান্তি দেয়।" },
    ],
    en: [
      { name:"Rahima Begum",   role:"Homemaker, Dhaka",          initials:"RB", text:"Found a plumber instantly through IMAP. The provider arrived on time and did great work. I felt completely safe throughout." },
      { name:"Tanvir Ahmed",   role:"Business Owner, Chittagong",initials:"TA", text:"Used IMAP for AC servicing. Affordable pricing, KYC-verified professional. No more worries about finding trustworthy help." },
      { name:"Nasrin Akter",   role:"Professional, Sylhet",      initials:"NA", text:"Arranged homecare for my elderly mother. Extremely caring provider! IMAP's SOS feature gives real peace of mind." },
    ],
  };

  const matchFaq = (text, lng) => {
    const list  = FAQ_DATA[lng] || FAQ_DATA.bn;
    const lower = text.toLowerCase();
    const keys  = ["দাম|price|cost|কত|charge|fee","বুক|book|কিভাবে|how","provider|হব|earn|income|আয়|কাজ","নিরাপদ|safe|security|trust","payment|pay|bkash|nagad|টাকা","cancel|refund|ফেরত|বাতিল"];
    for (let ki = 0; ki < keys.length; ki++) {
      if (keys[ki].split("|").some(k => lower.includes(k))) return list[ki];
    }
    return { q:"", a: lng === "en"
      ? "I can help with: pricing, booking, becoming a provider, safety, payments, and cancellations. What would you like to know?"
      : "আমি সাহায্য করতে পারি: মূল্য, বুকিং, Provider হওয়া, নিরাপত্তা, পেমেন্ট এবং বাতিল বিষয়ে। কী জানতে চান?" };
  };

  /* ─────────── STATE ─────────── */
  const [aiOpen,        setAiOpen]        = useState(false);
  const [aiMsg,         setAiMsg]         = useState("");
  const [aiChat,        setAiChat]        = useState([{
    from:"bot",
    text: "হ্যালো! আমি IMAP AI Assistant। সেবা, মূল্য, বুকিং বা নিরাপত্তা নিয়ে যেকোনো প্রশ্ন করুন! 👋"
  }]);
  const [faqOpen,       setFaqOpen]       = useState(null);
  const [annDismissed,  setAnnDismissed]  = useState(false);
  const chatEndRef = useRef(null);

  /* ─────────── SCROLL REVEAL ─────────── */
  const [revealed, setRevealed] = useState({});
  const revealRef = useCallback(node => {
    if (!node) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          setRevealed(r => ({ ...r, [e.target.dataset.rid]: true }));
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    obs.observe(node);
  }, []);

  /* ─────────── ANIMATED COUNTER ─────────── */
  const [statsVisible, setStatsVisible] = useState(false);
  const [counters, setCounters] = useState({ svc: 0, cust: 0, prov: 0, rat: 0 });
  const statsRef = useCallback(node => {
    if (!node) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setStatsVisible(true);
        obs.disconnect();
      }
    }, { threshold: 0.4 });
    obs.observe(node);
  }, []);

  useEffect(() => {
    if (!statsVisible) return;
    const targets = { svc: 500, cust: 10000, prov: 1200, rat: 4.8 };
    const dur = 1800, steps = 60, interval = dur / steps;
    let step = 0;
    const t = setInterval(() => {
      step++;
      const p = step / steps;
      const ease = 1 - Math.pow(1 - p, 3);
      setCounters({
        svc:  Math.round(targets.svc  * ease),
        cust: Math.round(targets.cust * ease),
        prov: Math.round(targets.prov * ease),
        rat:  Math.round(targets.rat  * ease * 10) / 10,
      });
      if (step >= steps) clearInterval(t);
    }, interval);
    return () => clearInterval(t);
  }, [statsVisible]);

  /* ─────────── COLOUR TOKENS ─────────── */
  /*  Light: BD flag green + red on white; Dark: brighter shades on near-black */
  const G        = dark ? "#00C170" : "#006A4E";   /* BD Green            */
  const GD       = dark ? "#009954" : "#004D38";   /* BD Green dark       */
  const GL       = dark ? "#0A2018" : "#E6F4EF";   /* Green light bg      */
  const R        = dark ? "#FF4D5E" : "#E8192C";   /* BD Red              */
  const RL       = dark ? "#1A0810" : "#FFF0F1";   /* Red light bg        */
  const bg       = dark ? "#0A100E" : "#FFFFFF";   /* Page background     */
  const bg2      = dark ? "#0F1A16" : "#F4FBF7";   /* Alternate section   */
  const card     = dark ? "#1A2820" : "#FFFFFF";   /* Card surface        */
  const cardBdr  = dark ? "#263C30" : "#DCE9E2";   /* Card border         */
  const txt      = dark ? "#E0EDE8" : "#1A2A24";   /* Primary text        */
  const sub      = dark ? "#8FAAA0" : "#4A6A60";   /* Secondary text      */
  const muted    = dark ? "#6A8880" : "#8FAAA0";   /* Muted text          */

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [aiChat]);
  useEffect(() => {
    setAiChat([{ from:"bot", text: lang === "en"
      ? "Hi! I'm IMAP AI Assistant. Ask me anything about services, pricing, safety, or booking! 👋"
      : "হ্যালো! আমি IMAP AI Assistant। সেবা, মূল্য, বুকিং বা নিরাপত্তা নিয়ে যেকোনো প্রশ্ন করুন! 👋" }]);
  }, [lang]);

  const sendAi = () => {
    const q = aiMsg.trim(); if (!q) return;
    setAiMsg("");
    const res = matchFaq(q, lang);
    setAiChat(c => [...c, { from:"user", text:q }, { from:"bot", text:res.a }]);
  };

  /* ─────────── I18N ─────────── */
  const T = (lang === "en" ? {
    annText:    "🎉 March Offer: 20% off your first service! Use code: IMAP20",
    heroTag:    "Bangladesh's Trusted Service Platform",
    heroH1:     "Bangladesh's #1 AI-Powered Service Platform",
    heroSub:    "Get trusted home services at your doorstep  •  Earn as a Provider  •  100% Safe & Verified",
    heroBtn1:"Get Service", heroBtn2:"Become a Provider", heroBtn3:"Ask AI",
    svcLabel:"WHAT WE OFFER",   svcTitle:"Any Service, Any Time",    svcSub:"Browse 500+ services without login. Book in minutes.",
    viewAll:"View All Services →",
    howLabel:"HOW IT WORKS",    howTitle:"Get Service in 4 Simple Steps",
    trustLabel:"WHY CHOOSE US", trustTitle:"Reasons to Trust IMAP",
    safeLabel:"SAFETY FIRST",   safeTitle:"Safety Is Our Top Priority",
    tmLabel:"TESTIMONIALS",     tmTitle:"Real Stories, Happy Customers",
    faqLabel:"FAQ",              faqTitle:"Frequently Asked Questions",
    ctaLabel:"GET STARTED TODAY",ctaTitle:"Join 10,000+ Satisfied Customers",
    ctaSub:"IMAP connects you with verified home service professionals across Bangladesh. Fast, safe, and reliable.",
    ctaBtn1:"Get Service Now", ctaBtn2:"Become a Provider",
    aiTitle:"AI Assistant",  aiPlaceholder:"Type your question…",
    navLogin:"Login", navReg:"Register",
    footerDesc:"For the people of Bangladesh — ensuring trusted, verified home services.",
    emergency:"National Emergency Numbers",
    sos_title:"SOS Emergency Alert", sos_desc:"During any service, one tap of the SOS button instantly alerts Admin Panel & Call Center. Legal action can be taken against perpetrators.",
    kyc_title:"Mandatory KYC Verification", kyc_desc:"Every provider must verify their NID, face photo, and credentials before any service. No anonymous providers allowed on IMAP.",
    legal_title:"Legal Protection & Anti-Fraud", legal_desc:"All providers sign our Code of Conduct. Fraud, harassment or misconduct leads to immediate account suspension and legal action under Bangladesh law.",
    privacy_title:"Data Privacy & Security", privacy_desc:"Your data is encrypted end-to-end. We never share personal information with third parties. SSL secured and BDPA compliant.",
  } : {
    annText:    "🎉 মার্চ অফার: প্রথম সেবায় ২০% ছাড়! কোড ব্যবহার করুন: IMAP20",
    heroTag:    "বাংলাদেশের বিশ্বস্ত সার্ভিস প্ল্যাটফর্ম",
    heroH1:     "বাংলাদেশের #১ AI-পাওয়ার্ড সার্ভিস প্ল্যাটফর্ম",
    heroSub:    "ঘরে বসে বিশ্বস্ত সেবা নিন  •  Provider হয়ে আয় করুন  •  সম্পূর্ণ নিরাপদ",
    heroBtn1:"সেবা নিন", heroBtn2:"সেবাদাতা হোন", heroBtn3:"AI-কে জিজ্ঞেস করুন",
    svcLabel:"আমাদের সেবাসমূহ", svcTitle:"যেকোনো সেবা, যেকোনো সময়", svcSub:"লগইন ছাড়াই ৫০০+ সেবা ব্রাউজ করুন। মিনিটেই বুক করুন।",
    viewAll:"সব সেবা দেখুন →",
    howLabel:"কিভাবে কাজ করে", howTitle:"৪টি সহজ ধাপে সেবা নিন",
    trustLabel:"কেন IMAP বেছে নেবেন", trustTitle:"আমাদের বিশ্বাস করার কারণ",
    safeLabel:"নিরাপত্তা",      safeTitle:"নিরাপত্তা আমাদের সর্বোচ্চ অগ্রাধিকার",
    tmLabel:"গ্রাহকের মতামত",   tmTitle:"সুখী গ্রাহকের বাস্তব অভিজ্ঞতা",
    faqLabel:"প্রশ্নোত্তর",      faqTitle:"সাধারণ জিজ্ঞাসা",
    ctaLabel:"আজই শুরু করুন",   ctaTitle:"১০,০০০+ সন্তুষ্ট গ্রাহকের সাথে যোগ দিন",
    ctaSub:"IMAP বাংলাদেশ জুড়ে যাচাইকৃত সার্ভিস প্রফেশনালদের সাথে আপনাকে সংযুক্ত করে। দ্রুত, নিরাপদ ও নির্ভরযোগ্য।",
    ctaBtn1:"এখনই সেবা নিন", ctaBtn2:"সেবাদাতা হোন",
    aiTitle:"AI সহায়তা", aiPlaceholder:"যেকোনো প্রশ্ন লিখুন…",
    navLogin:"লগইন", navReg:"নিবন্ধন",
    footerDesc:"বাংলাদেশের মানুষের জন্য — বিশ্বস্ত, যাচাইকৃত গৃহ সেবা নিশ্চিত করতে।",
    emergency:"জাতীয় জরুরি নম্বর",
    sos_title:"SOS জরুরি সতর্কতা", sos_desc:"সেবা চলাকালীন যেকোনো পরিস্থিতিতে একটি বাটন চাপলেই Admin প্যানেল ও Call Center তাৎক্ষণিক সতর্ক হয়। আইনি ব্যবস্থা নেওয়ার সুযোগ পাওয়া যায়।",
    kyc_title:"বাধ্যতামূলক KYC যাচাই", kyc_desc:"প্রতিটি Provider-কে NID, মুখের ছবি ও যোগ্যতার সনদ যাচাই করতে হয়। IMAP-এ কোনো পরিচয়হীন Provider অনুমোদন পায় না।",
    legal_title:"আইনি সুরক্ষা ও প্রতারণা-বিরোধী", legal_desc:"সব Provider আচরণবিধি স্বাক্ষর করেন। প্রতারণা, হয়রানি বা অসদাচরণে তাৎক্ষণিক অ্যাকাউন্ট বাতিল ও বাংলাদেশ আইনে আইনি ব্যবস্থা।",
    privacy_title:"ডেটা গোপনীয়তা ও নিরাপত্তা", privacy_desc:"আপনার ডেটা এন্ড-টু-এন্ড এনক্রিপ্টেড। তৃতীয় পক্ষের সাথে ব্যক্তিগত তথ্য কখনো শেয়ার নয়। SSL সুরক্ষিত ও BDPA-সম্মত।",
  });

  const HOW_STEPS = (lang === "en" ? [
    { icon:"🔍", t:"Browse Services",     d:"Explore 500+ services without login and compare packages" },
    { icon:"📝", t:"Quick Registration",  d:"Sign up in 2 minutes with your phone number or email" },
    { icon:"📅", t:"Confirm Booking",     d:"Choose a nearby verified provider, confirm time & price" },
    { icon:"✅", t:"Enjoy the Service",   d:"Provider arrives on schedule — rate & review afterward" },
  ] : [
    { icon:"🔍", t:"সেবা ব্রাউজ করুন",    d:"লগইন ছাড়াই ৫০০+ সেবা দেখুন এবং প্যাকেজ তুলনা করুন" },
    { icon:"📝", t:"দ্রুত নিবন্ধন করুন",  d:"ফোন নম্বর বা ইমেইল দিয়ে মাত্র ২ মিনিটে রেজিস্ট্রেশন" },
    { icon:"📅", t:"বুকিং নিশ্চিত করুন",  d:"কাছের যাচাইকৃত Provider বেছে নিন, সময় ও মূল্য নিশ্চিত করুন" },
    { icon:"✅", t:"সেবা উপভোগ করুন",     d:"Provider নির্ধারিত সময়ে আসবেন — শেষে রেটিং দিন" },
  ]);

  const TRUST_ITEMS = (lang === "en" ? [
    { icon:"🪪", t:"NID / KYC Verified",         d:"Every provider must verify NID, face photo & credentials. No anonymous providers." },
    { icon:"🔒", t:"Secure Encrypted Payments",  d:"bKash, Nagad, Card & Cash — all transactions encrypted. Money-back guarantee." },
    { icon:"🆘", t:"Live SOS Emergency Button",  d:"One tap instantly alerts Admin & Call Center during any service. 24/7 active." },
    { icon:"📞", t:"24/7 Customer Support",       d:"Our support center is always ready. All complaints resolved within 24 hours." },
    { icon:"⚖️", t:"Full Legal Protection",      d:"Complete legal framework. Fraud & misconduct lead to immediate legal action." },
    { icon:"⭐", t:"4.8★ Average Rating",        d:"10,000+ satisfied customers trust IMAP across all divisions of Bangladesh." },
  ] : [
    { icon:"🪪", t:"NID / KYC যাচাই বাধ্যতামূলক", d:"প্রতিটি Provider NID, মুখের ছবি ও সনদ যাচাই করা বাধ্যতামূলক। পরিচয়হীন কেউ নেই।" },
    { icon:"🔒", t:"এনক্রিপ্টেড নিরাপদ পেমেন্ট",   d:"bKash, Nagad, Card ও Cash — সব লেনদেন এনক্রিপ্টেড। মানি-ব্যাক গ্যারান্টি।" },
    { icon:"🆘", t:"লাইভ SOS জরুরি বাটন",          d:"একটি বাটনে তাৎক্ষণিক Admin ও Call Center সতর্ক। ২৪/৭ সক্রিয়।" },
    { icon:"📞", t:"২৪/৭ গ্রাহক সেবা",              d:"আমাদের সাপোর্ট সেন্টার সর্বদা প্রস্তুত। সব অভিযোগ ২৪ ঘণ্টায় সমাধান।" },
    { icon:"⚖️", t:"সম্পূর্ণ আইনি সুরক্ষা",        d:"সম্পূর্ণ আইনি কাঠামো। প্রতারণা ও অসদাচরণে তাৎক্ষণিক আইনি ব্যবস্থা।" },
    { icon:"⭐", t:"৪.৮★ গড় রেটিং",               d:"বাংলাদেশের সকল বিভাগে ১০,০০০+ সন্তুষ্ট গ্রাহক IMAP-এ বিশ্বাস রাখেন।" },
  ]);

  const faqList   = FAQ_DATA[lang]    || FAQ_DATA.bn;
  const tmList    = TESTIMONIALS[lang]|| TESTIMONIALS.bn;

  /* ─────────── RENDER ─────────── */
  return (
    <div style={{ fontFamily:"'Hind Siliguri','Noto Sans Bengali',sans-serif", background:bg, color:txt, minHeight:"100vh", lineHeight:1.6 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}

        /* ── Animations ── */
        @keyframes lp-fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes lp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes lp-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes lp-floatA{0%,100%{transform:translate(0,0) rotate(0deg)}33%{transform:translate(6px,-10px) rotate(8deg)}66%{transform:translate(-4px,6px) rotate(-6deg)}}
        @keyframes lp-floatB{0%,100%{transform:translate(0,0) rotate(0deg)}33%{transform:translate(-8px,8px) rotate(-10deg)}66%{transform:translate(5px,-5px) rotate(7deg)}}
        @keyframes lp-floatC{0%,100%{transform:translate(0,0) rotate(0deg)}50%{transform:translate(10px,-8px) rotate(12deg)}}
        @keyframes lp-floatD{0%,100%{transform:translate(0,0)}25%{transform:translate(-6px,-12px)}75%{transform:translate(4px,8px)}}
        @keyframes lp-revealUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
        @keyframes lp-revealLeft{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}
        @keyframes lp-revealRight{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
        @keyframes lp-scaleIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
        @keyframes lp-pulse-sos{0%,100%{box-shadow:0 0 0 0 rgba(232,25,44,.5)}60%{box-shadow:0 0 0 12px rgba(232,25,44,0)}}
        @keyframes lp-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
        @keyframes lp-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}
        @keyframes lp-wave{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.6)}}
        @keyframes lp-badge-pop{0%{transform:scale(0) rotate(-15deg)}70%{transform:scale(1.15) rotate(4deg)}100%{transform:scale(1) rotate(0)}}
        @keyframes lp-count-pop{0%{transform:scale(1)}30%{transform:scale(1.18)}100%{transform:scale(1)}}
        @keyframes lp-orbit{from{transform:rotate(0deg) translateX(90px) rotate(0deg)}to{transform:rotate(360deg) translateX(90px) rotate(-360deg)}}
        @keyframes lp-orbit2{from{transform:rotate(180deg) translateX(140px) rotate(-180deg)}to{transform:rotate(540deg) translateX(140px) rotate(-540deg)}}
        @keyframes lp-ripple{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.4);opacity:0}}
        @keyframes lp-slide-ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

        /* ── Scroll reveal classes ── */
        .lp-reveal{opacity:0;transform:translateY(40px);transition:opacity .65s cubic-bezier(.16,1,.3,1),transform .65s cubic-bezier(.16,1,.3,1);}
        .lp-reveal.vis{opacity:1;transform:translateY(0);}
        .lp-reveal-l{opacity:0;transform:translateX(-40px);transition:opacity .65s cubic-bezier(.16,1,.3,1),transform .65s cubic-bezier(.16,1,.3,1);}
        .lp-reveal-l.vis{opacity:1;transform:translateX(0);}
        .lp-reveal-r{opacity:0;transform:translateX(40px);transition:opacity .65s cubic-bezier(.16,1,.3,1),transform .65s cubic-bezier(.16,1,.3,1);}
        .lp-reveal-r.vis{opacity:1;transform:translateX(0);}
        .lp-reveal-scale{opacity:0;transform:scale(.85);transition:opacity .55s cubic-bezier(.16,1,.3,1),transform .55s cubic-bezier(.16,1,.3,1);}
        .lp-reveal-scale.vis{opacity:1;transform:scale(1);}

        /* ── Service icon wiggle on hover ── */
        .lp-svc-card:hover .svc-icon{animation:lp-wiggle .45s ease;}

        /* ── Shimmer skeleton for loading state ── */
        .lp-shimmer{background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.18) 50%,rgba(255,255,255,0) 100%);background-size:400px 100%;animation:lp-shimmer 1.8s infinite linear;}

        /* ── SOS pulse ── */
        .lp-sos-pulse{animation:lp-pulse-sos 2s ease-in-out infinite;}

        /* ── Step hover lift ── */
        .lp-step{transition:transform .22s,box-shadow .22s;}
        .lp-step:hover{transform:translateY(-6px);box-shadow:0 18px 44px rgba(0,0,0,.15)!important;}

        /* ── Trust card reveal stagger (CSS only) ── */
        .trust-card-wrap:nth-child(2){transition-delay:.1s!important}
        .trust-card-wrap:nth-child(3){transition-delay:.2s!important}
        .trust-card-wrap:nth-child(4){transition-delay:.3s!important}
        .trust-card-wrap:nth-child(5){transition-delay:.4s!important}
        .trust-card-wrap:nth-child(6){transition-delay:.5s!important}

        /* ── Testimonial stagger ── */
        .tm-card-wrap:nth-child(2){transition-delay:.15s!important}
        .tm-card-wrap:nth-child(3){transition-delay:.3s!important}

        /* ── Service card stagger ── */
        .svc-card-wrap:nth-child(2){transition-delay:.04s!important}
        .svc-card-wrap:nth-child(3){transition-delay:.08s!important}
        .svc-card-wrap:nth-child(4){transition-delay:.12s!important}
        .svc-card-wrap:nth-child(5){transition-delay:.16s!important}
        .svc-card-wrap:nth-child(6){transition-delay:.20s!important}
        .svc-card-wrap:nth-child(7){transition-delay:.24s!important}
        .svc-card-wrap:nth-child(8){transition-delay:.28s!important}
        .svc-card-wrap:nth-child(9){transition-delay:.32s!important}
        .svc-card-wrap:nth-child(10){transition-delay:.36s!important}
        .svc-card-wrap:nth-child(11){transition-delay:.40s!important}
        .svc-card-wrap:nth-child(12){transition-delay:.44s!important}

        /* ── Buttons ── */
        .lp-btn{border:none;cursor:pointer;font-family:inherit;transition:all .2s cubic-bezier(.16,1,.3,1);font-weight:700;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;}
        .lp-btn-g{background:linear-gradient(135deg,#008B65,#006A4E);color:#fff;padding:13px 30px;font-size:15px;border-radius:10px;box-shadow:0 4px 16px #006A4E44;}
        .lp-btn-g:hover{background:linear-gradient(135deg,#009954,#007558);transform:translateY(-2px);box-shadow:0 8px 24px #006A4E55;}
        .lp-btn-g:active{transform:translateY(0);}
        .lp-btn-r{background:linear-gradient(135deg,#E8192C,#C0001B);color:#fff;padding:13px 30px;font-size:15px;border-radius:10px;box-shadow:0 4px 16px #E8192C44;}
        .lp-btn-r:hover{background:linear-gradient(135deg,#F02030,#D0001F);transform:translateY(-2px);}
        .lp-btn-o{background:transparent;color:${G};border:2px solid ${G}!important;padding:12px 28px;font-size:15px;border-radius:10px;}
        .lp-btn-o:hover{background:${GL};transform:translateY(-1px);}
        .lp-btn-white{background:#FFFFFF;color:${G};padding:13px 30px;font-size:15px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.18);}
        .lp-btn-white:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.22);}
        .lp-btn-ghost{background:rgba(255,255,255,.12);color:#FFFFFF;border:1.5px solid rgba(255,255,255,.3)!important;padding:12px 28px;font-size:15px;border-radius:10px;}
        .lp-btn-ghost:hover{background:rgba(255,255,255,.2);transform:translateY(-1px);}

        /* ── Cards ── */
        .lp-card{background:${card};border:1px solid ${cardBdr};border-radius:14px;transition:border-color .22s,box-shadow .22s;box-shadow:0 2px 8px rgba(0,0,0,${dark?".18":".05"});}
        .lp-card:hover{border-color:${G}66;box-shadow:0 8px 28px rgba(0,0,0,${dark?".28":".1"});}
        .lp-svc-card{background:${card};border:1px solid ${cardBdr};border-radius:14px;padding:22px 14px;text-align:center;cursor:pointer;transition:all .22s;box-shadow:0 2px 8px rgba(0,0,0,${dark?".18":".05"});}
        .lp-svc-card:hover{transform:translateY(-5px);box-shadow:0 16px 40px rgba(0,0,0,${dark?".3":".12"});}
        .lp-step{background:${card};border:1px solid ${cardBdr};border-radius:16px;padding:32px 22px 26px;text-align:center;position:relative;box-shadow:0 2px 8px rgba(0,0,0,${dark?".18":".05"});}
        .lp-tm-card{background:${card};border:1px solid ${cardBdr};border-radius:16px;padding:28px 26px;box-shadow:0 2px 8px rgba(0,0,0,${dark?".18":".05"});}

        /* ── FAQ ── */
        .lp-faq{background:${card};border:1px solid ${cardBdr};border-radius:12px;overflow:hidden;transition:border-color .2s;}
        .lp-faq:hover{border-color:${G}55;}
        .lp-faq-q{width:100%;background:none;border:none;cursor:pointer;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;font-family:inherit;font-size:15px;font-weight:700;color:${txt};text-align:left;gap:12px;}
        .lp-faq-a{padding:0 24px 18px;font-size:14px;color:${sub};line-height:1.75;}

        /* ── Stat strip ── */
        .lp-stat{text-align:center;flex:1;padding:22px 20px;}
        .lp-stat+.lp-stat{border-left:1px solid rgba(255,255,255,.15);}

        /* ── Contact link ── */
        .lp-contact-link{display:flex;align-items:center;gap:14px;padding:16px 20px;border-radius:12px;background:${card};border:1px solid ${cardBdr};cursor:pointer;transition:all .2s;text-decoration:none;color:${txt};}
        .lp-contact-link:hover{border-color:${G}55;background:${dark?"rgba(0,193,112,.06)":GL};}

        /* ── Section label ── */
        .sec-label{display:inline-block;font-size:11px;letter-spacing:2.5px;font-weight:700;text-transform:uppercase;margin-bottom:10px;}

        /* ── Responsive ── */
        @media(max-width:900px){
          .lp-4col{grid-template-columns:repeat(2,1fr)!important}
          .lp-3col{grid-template-columns:repeat(2,1fr)!important}
          .lp-2col{grid-template-columns:1fr!important}
          .lp-footer-cols{grid-template-columns:1fr 1fr!important}
        }
        @media(max-width:640px){
          .lp-stat+.lp-stat{border-left:none;border-top:1px solid rgba(255,255,255,.12);}
          .lp-stats-flex{flex-direction:column!important}
          .lp-4col{grid-template-columns:repeat(2,1fr)!important}
          .lp-3col{grid-template-columns:1fr!important}
          .lp-2col-safe{grid-template-columns:1fr!important}
          .lp-svc-grid{grid-template-columns:repeat(3,1fr)!important}
          .lp-footer-cols{grid-template-columns:1fr!important}
          .lp-hero-btns{flex-direction:column!important;align-items:stretch!important}
          .lp-hero-btns .lp-btn{justify-content:center!important}
          .lp-cta-btns{flex-direction:column!important;align-items:stretch!important}
          .lp-cta-btns .lp-btn{justify-content:center!important}
          .lp-svc-card{padding:16px 10px!important}
          .lp-tm-card{padding:20px 16px!important}
        }
      `}</style>

      {/* ════════════ ANNOUNCEMENT STRIP ════════════ */}
      {!annDismissed && (
        <div role="banner" style={{ background:`linear-gradient(90deg,${GD},${G})`, padding:"10px 20px", textAlign:"center", position:"relative", zIndex:950 }}>
          <span style={{ color:"#FFFFFF", fontSize:13, fontWeight:600 }}>{T.annText}</span>
          <button onClick={() => setAnnDismissed(true)}
            aria-label="Dismiss announcement"
            style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"rgba(255,255,255,.75)", cursor:"pointer", fontSize:20, lineHeight:1, padding:"0 4px" }}>×</button>
        </div>
      )}

      {/* ════════════ NAV ════════════ */}
      <nav aria-label="Main navigation" style={{
        background: dark ? "#0F1A16" : "#FFFFFF",
        borderBottom:`1px solid ${cardBdr}`,
        position:"sticky", top:0, zIndex:900,
        boxShadow: dark ? "0 1px 10px rgba(0,0,0,.4)" : "0 1px 10px rgba(0,0,0,.07)",
      }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 24px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={onGetStarted}>
            <div style={{ width:38, height:38, borderRadius:10, background:`linear-gradient(135deg,${G},${GD})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:21, flexShrink:0 }}>🌿</div>
            <div>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:21, fontWeight:800, color:G, letterSpacing:-.5, lineHeight:1 }}>IMAP</div>
              <div style={{ fontSize:9, color:muted, letterSpacing:1.5, textTransform:"uppercase" }}>AI Service Platform BD</div>
            </div>
          </div>
          {/* Actions */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={() => setLang && setLang(lang === "bn" ? "en" : "bn")}
              style={{ background:"none", border:`1px solid ${cardBdr}`, borderRadius:7, padding:"5px 12px", cursor:"pointer", fontSize:12, fontWeight:700, color:sub }}>
              {lang === "bn" ? "EN" : "বাং"}
            </button>
            <button onClick={() => setDark && setDark(d => !d)}
              style={{ background:"none", border:`1px solid ${cardBdr}`, borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:16 }}>
              {dark ? "☀️" : "🌙"}
            </button>
            <button className="lp-btn lp-btn-o" style={{ fontSize:13, padding:"7px 16px" }} onClick={onGetStarted}>{T.navLogin}</button>
            <button className="lp-btn lp-btn-g" style={{ fontSize:13, padding:"8px 16px" }} onClick={onGetStarted}>{T.navReg}</button>
          </div>
        </div>
      </nav>

      {/* ════════════ HERO ════════════ */}
      <header itemScope itemType="https://schema.org/WebSite" style={{
        background: dark
          ? "linear-gradient(160deg,#040A06 0%,#061008 35%,#0A1F12 65%,#061008 100%)"
          : "linear-gradient(160deg,#003D2B 0%,#004D38 35%,#006A4E 65%,#005040 100%)",
        padding:"96px 24px 112px",
        position:"relative", overflow:"hidden",
        borderBottom:`4px solid ${R}`,
      }}>
        {/* Subtle BD flag circle decoration */}
        <div style={{ position:"absolute", right:"5%", top:"10%", width:280, height:280, borderRadius:"50%", background:`radial-gradient(circle,${R}18 0%,transparent 70%)`, pointerEvents:"none", animation:"lp-float 7s ease-in-out infinite" }}/>
        <div style={{ position:"absolute", left:"-5%", bottom:"-10%", width:200, height:200, borderRadius:"50%", background:`radial-gradient(circle,rgba(255,255,255,.04) 0%,transparent 70%)`, pointerEvents:"none" }}/>
        {/* Dot grid overlay */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px)", backgroundSize:"28px 28px", pointerEvents:"none" }}/>

        {/* ── Floating service icon decorations ── */}
        {[
          { icon:"🏠", top:"12%",  left:"4%",   size:40, anim:"lp-floatA", dur:"6s",  delay:"0s",   opacity:.55 },
          { icon:"🧹", top:"68%",  left:"3%",   size:34, anim:"lp-floatB", dur:"7.5s",delay:".8s",  opacity:.45 },
          { icon:"🔧", top:"22%",  right:"4%",  size:38, anim:"lp-floatC", dur:"5.5s",delay:".3s",  opacity:.5  },
          { icon:"👩‍⚕️",top:"60%",  right:"5%",  size:36, anim:"lp-floatD", dur:"8s",  delay:"1s",   opacity:.45 },
          { icon:"⚡", top:"40%",  left:"8%",   size:30, anim:"lp-floatB", dur:"6.5s",delay:"1.5s", opacity:.35 },
          { icon:"🚚", top:"78%",  right:"10%", size:32, anim:"lp-floatA", dur:"7s",  delay:"2s",   opacity:.4  },
          { icon:"📚", top:"8%",   right:"20%", size:28, anim:"lp-floatC", dur:"9s",  delay:".5s",  opacity:.3  },
          { icon:"🛡️", top:"85%",  left:"18%",  size:28, anim:"lp-floatD", dur:"8.5s",delay:"1.2s", opacity:.3  },
        ].map((f, i) => (
          <div key={i} style={{
            position:"absolute", top:f.top, left:f.left, right:f.right,
            fontSize:f.size, opacity:f.opacity,
            animation:`${f.anim} ${f.dur} ease-in-out ${f.delay} infinite`,
            pointerEvents:"none", userSelect:"none", zIndex:0,
            filter:"drop-shadow(0 4px 8px rgba(0,0,0,.3))",
          }}>{f.icon}</div>
        ))}

        <div style={{ maxWidth:820, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          {/* Country badge */}
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.2)", borderRadius:30, padding:"6px 18px", fontSize:13, color:"rgba(255,255,255,.85)", marginBottom:22, fontWeight:600 }}>
            🇧🇩 &nbsp;{T.heroTag}
          </div>
          {/* H1 — SEO key heading */}
          <h1 itemProp="name" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:"clamp(28px,5vw,52px)", fontWeight:800, color:"#FFFFFF", lineHeight:1.18, marginBottom:18, textShadow:"0 2px 16px rgba(0,0,0,.3)" }}>
            {T.heroH1}
          </h1>
          <p style={{ fontSize:"clamp(14px,2vw,18px)", color:"rgba(255,255,255,.8)", marginBottom:42, lineHeight:1.75 }}>{T.heroSub}</p>

          {/* CTA buttons */}
          <div className="lp-hero-btns" style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap", marginBottom:46 }}>
            <button className="lp-btn lp-btn-white" onClick={onGetStarted}>🛍️ {T.heroBtn1}</button>
            <button className="lp-btn lp-btn-ghost" onClick={onRegisterProvider}>👷 {T.heroBtn2}</button>
            <button className="lp-btn" style={{ background:"transparent", color:"rgba(255,255,255,.78)", border:"1px solid rgba(255,255,255,.22)", padding:"12px 24px", fontSize:14, borderRadius:10 }} onClick={() => setAiOpen(true)}>🤖 {T.heroBtn3}</button>
          </div>

          {/* Trust pill badges */}
          <div style={{ display:"flex", justifyContent:"center", gap:10, flexWrap:"wrap" }}>
            {["✅ KYC Verified", "🔒 Secure Payment", "🆘 SOS Protected", "⚖️ Legal Shield"].map(b => (
              <span key={b} style={{ fontSize:12, color:"rgba(255,255,255,.78)", background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.15)", borderRadius:20, padding:"5px 14px", fontWeight:600 }}>{b}</span>
            ))}
          </div>
        </div>
      </header>

      {/* ════════════ WAVE DIVIDER ════════════ */}
      <div style={{ lineHeight:0, background: dark ? "#0F1A16" : "#006A4E", marginTop:-2 }}>
        <svg viewBox="0 0 1440 48" preserveAspectRatio="none" style={{ display:"block", width:"100%", height:48 }}>
          <path d="M0,32 C240,0 480,48 720,24 C960,0 1200,48 1440,24 L1440,0 L0,0 Z"
            fill={dark ? "#040A06" : "#004D38"} />
        </svg>
      </div>

      {/* ════════════ STATS STRIP ════════════ */}
      <section aria-label="Platform statistics" ref={statsRef} style={{ background: dark ? "#0F1A16" : "#006A4E" }}>
        <div style={{ maxWidth:1000, margin:"0 auto" }}>
          <div className="lp-stats-flex" style={{ display:"flex" }}>
            {[
              { val: counters.svc,  suffix:"+",  bn:"সেবা",        en:"Services"  },
              { val: counters.cust, suffix:"+",  bn:"গ্রাহক",      en:"Customers" },
              { val: counters.prov, suffix:"+",  bn:"প্রোভাইডার", en:"Providers" },
              { val: counters.rat,  suffix:"★",  bn:"রেটিং",      en:"Rating"    },
            ].map(({ val, suffix, bn, en }, i) => (
              <div key={i} className="lp-stat">
                <div style={{
                  fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:30, fontWeight:800, color:"#FFFFFF", lineHeight:1,
                  animation: statsVisible ? `lp-count-pop .4s ease ${i * .15}s both` : "none",
                }}>
                  {val >= 1000 ? (val / 1000).toFixed(0) + "K" : val}{suffix}
                </div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,.7)", marginTop:5 }}>{lang === "bn" ? bn : en}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ SERVICES ════════════ */}
      <section aria-labelledby="svc-heading" style={{ padding:"84px 24px", background:bg2 }}>
        <div style={{ maxWidth:1200, margin:"0 auto" }}>
          <div ref={revealRef} data-rid="svc-head" className={`lp-reveal${revealed["svc-head"]?" vis":""}`}
            style={{ textAlign:"center", marginBottom:52 }}>
            <span className="sec-label" style={{ color:G }}>{T.svcLabel}</span>
            <h2 id="svc-heading" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:"clamp(22px,3.5vw,32px)", fontWeight:800, color:txt, lineHeight:1.25, marginBottom:12 }}>{T.svcTitle}</h2>
            <p style={{ fontSize:15, color:sub, lineHeight:1.65 }}>{T.svcSub}</p>
          </div>

          <div className="lp-svc-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
            {CATS.map((c, idx) => (
              <div key={c.nameBn} className={`svc-card-wrap lp-reveal-scale${revealed[`svc-${idx}`]?" vis":""}`}
                ref={revealRef} data-rid={`svc-${idx}`}>
                <article className="lp-svc-card"
                  onClick={onGetStarted}
                  style={{ borderTop:`3px solid ${c.col}` }}
                  itemScope itemType="https://schema.org/Service">
                  <div className="svc-icon" style={{ fontSize:38, marginBottom:12 }}>{c.icon}</div>
                  <div itemProp="name" style={{ fontSize:14, fontWeight:700, color:txt, marginBottom:8, lineHeight:1.3 }}>
                    {lang === "en" ? c.nameEn : c.nameBn}
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:c.col, background:`${c.col}18`, borderRadius:20, padding:"3px 10px", display:"inline-block" }}>
                    {lang === "en" ? c.priceEn : c.priceBn}
                  </div>
                </article>
              </div>
            ))}
          </div>

          <div ref={revealRef} data-rid="svc-btn" className={`lp-reveal${revealed["svc-btn"]?" vis":""}`}
            style={{ textAlign:"center", marginTop:36 }}>
            <button className="lp-btn lp-btn-g" onClick={onGetStarted}>{T.viewAll}</button>
          </div>
        </div>
      </section>

      {/* ════════════ HOW IT WORKS ════════════ */}
      <section aria-labelledby="how-heading" style={{ padding:"84px 24px", background:bg }}>
        <div style={{ maxWidth:980, margin:"0 auto" }}>
          <div ref={revealRef} data-rid="how-head" className={`lp-reveal${revealed["how-head"]?" vis":""}`}
            style={{ textAlign:"center", marginBottom:52 }}>
            <span className="sec-label" style={{ color:G }}>{T.howLabel}</span>
            <h2 id="how-heading" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:"clamp(22px,3.5vw,32px)", fontWeight:800, color:txt }}>{T.howTitle}</h2>
          </div>
          <div className="lp-4col" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:22 }}>
            {HOW_STEPS.map((h, i) => (
              <div key={i}
                ref={revealRef} data-rid={`how-${i}`}
                className={`lp-reveal${revealed[`how-${i}`]?" vis":""}`}
                style={{ transitionDelay:`${i * .12}s` }}>
                <div className="lp-step">
                  {/* Step number circle */}
                  <div style={{ position:"absolute", top:-16, left:"50%", transform:"translateX(-50%)", width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,${G},${GD})`, color:"#FFFFFF", fontWeight:800, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:`0 4px 14px ${G}55` }}>{i + 1}</div>
                  <div style={{ fontSize:44, marginBottom:14, marginTop:8 }}>{h.icon}</div>
                  <div style={{ fontWeight:800, fontSize:15, marginBottom:8, color:txt }}>{h.t}</div>
                  <div style={{ fontSize:13, color:sub, lineHeight:1.7 }}>{h.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ WHY CHOOSE US ════════════ */}
      <section aria-labelledby="trust-heading" style={{ padding:"84px 24px", background:bg2 }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div ref={revealRef} data-rid="trust-head" className={`lp-reveal${revealed["trust-head"]?" vis":""}`}
            style={{ textAlign:"center", marginBottom:52 }}>
            <span className="sec-label" style={{ color:G }}>{T.trustLabel}</span>
            <h2 id="trust-heading" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:"clamp(22px,3.5vw,32px)", fontWeight:800, color:txt }}>{T.trustTitle}</h2>
          </div>
          <div className="lp-3col" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
            {TRUST_ITEMS.map((t, i) => (
              <div key={i}
                ref={revealRef} data-rid={`trust-${i}`}
                className={`trust-card-wrap lp-reveal-scale${revealed[`trust-${i}`]?" vis":""}`}
                style={{ transitionDelay:`${i * .1}s` }}>
                <div className="lp-card" style={{ padding:"26px 24px" }}>
                  <div style={{ fontSize:36, marginBottom:14 }}>{t.icon}</div>
                  <div style={{ fontWeight:800, fontSize:16, marginBottom:8, color:txt }}>{t.t}</div>
                  <div style={{ fontSize:13, color:sub, lineHeight:1.7 }}>{t.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ SAFETY ════════════ */}
      <section aria-labelledby="safety-heading" style={{ padding:"84px 24px", background: dark ? "#0C0F0A" : "#FFF8F9" }}>
        <div style={{ maxWidth:980, margin:"0 auto" }}>
          <div ref={revealRef} data-rid="safe-head" className={`lp-reveal${revealed["safe-head"]?" vis":""}`}
            style={{ textAlign:"center", marginBottom:52 }}>
            <span className="sec-label" style={{ color:R }}>{T.safeLabel}</span>
            <h2 id="safety-heading" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:"clamp(22px,3.5vw,32px)", fontWeight:800, color: dark ? "#FFB3BA" : "#9B0000" }}>{T.safeTitle}</h2>
          </div>

          <div className="lp-2col-safe" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            {/* SOS */}
            <div ref={revealRef} data-rid="safe-sos" className={`lp-reveal-l${revealed["safe-sos"]?" vis":""}`}>
              <div style={{ background:dark?"#1A0A0C":"#FFFFFF", border:`1.5px solid ${R}33`, borderLeft:`4px solid ${R}`, borderRadius:14, padding:28, boxShadow:`0 4px 20px ${R}12` }}>
                <div className="lp-sos-pulse" style={{ fontSize:42, marginBottom:14, display:"inline-block", borderRadius:12 }}>🆘</div>
                <h3 style={{ fontWeight:800, fontSize:18, color:R, marginBottom:10 }}>{T.sos_title}</h3>
                <p style={{ fontSize:14, color:dark?"#FFBABF":"#7A0010", lineHeight:1.75 }}>{T.sos_desc}</p>
                <div style={{ marginTop:16, padding:"10px 16px", background:`${R}12`, borderRadius:8, fontSize:13, color:R, fontWeight:700 }}>
                  🚨 {lang === "en" ? "Emergency: 999 · 199 · 16430" : "জরুরি: ৯৯৯ · ১৯৯ · ১৬৪৩০"}
                </div>
              </div>
            </div>

            {/* KYC */}
            <div ref={revealRef} data-rid="safe-kyc" className={`lp-reveal-r${revealed["safe-kyc"]?" vis":""}`}>
              <div style={{ background:dark?"#0A1A12":"#FFFFFF", border:`1.5px solid ${G}33`, borderLeft:`4px solid ${G}`, borderRadius:14, padding:28, boxShadow:`0 4px 20px ${G}12` }}>
                <div style={{ fontSize:42, marginBottom:14 }}>🪪</div>
                <h3 style={{ fontWeight:800, fontSize:18, color:G, marginBottom:10 }}>{T.kyc_title}</h3>
                <p style={{ fontSize:14, color:dark?sub:"#0A3D20", lineHeight:1.75 }}>{T.kyc_desc}</p>
                <div style={{ marginTop:16, padding:"10px 16px", background:`${G}12`, borderRadius:8, fontSize:13, color:G, fontWeight:700 }}>
                  ✅ {lang === "en" ? "100% Verified & Trusted" : "১০০% যাচাইকৃত ও বিশ্বস্ত"}
                </div>
              </div>
            </div>

            {/* Legal */}
            <div ref={revealRef} data-rid="safe-legal" className={`lp-reveal-l${revealed["safe-legal"]?" vis":""}`}
              style={{ transitionDelay:".1s" }}>
              <div style={{ background:dark?"#0C0A1C":"#FFFFFF", border:"1.5px solid #6366F144", borderLeft:"4px solid #6366F1", borderRadius:14, padding:28, boxShadow:"0 4px 20px #6366F112" }}>
                <div style={{ fontSize:42, marginBottom:14 }}>⚖️</div>
                <h3 style={{ fontWeight:800, fontSize:18, color:"#4338CA", marginBottom:10 }}>{T.legal_title}</h3>
                <p style={{ fontSize:14, color:dark?"#A5B4FC":"#312E81", lineHeight:1.75 }}>{T.legal_desc}</p>
              </div>
            </div>

            {/* Privacy */}
            <div ref={revealRef} data-rid="safe-priv" className={`lp-reveal-r${revealed["safe-priv"]?" vis":""}`}
              style={{ transitionDelay:".1s" }}>
              <div style={{ background:dark?"#0A0C1E":"#FFFFFF", border:"1.5px solid #3B82F644", borderLeft:"4px solid #3B82F6", borderRadius:14, padding:28, boxShadow:"0 4px 20px #3B82F612" }}>
                <div style={{ fontSize:42, marginBottom:14 }}>🔐</div>
                <h3 style={{ fontWeight:800, fontSize:18, color:"#2563EB", marginBottom:10 }}>{T.privacy_title}</h3>
                <p style={{ fontSize:14, color:dark?"#93C5FD":"#1E3A8A", lineHeight:1.75 }}>{T.privacy_desc}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ TESTIMONIALS ════════════ */}
      <section aria-labelledby="tm-heading" style={{ padding:"84px 24px", background:bg }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div ref={revealRef} data-rid="tm-head" className={`lp-reveal${revealed["tm-head"]?" vis":""}`}
            style={{ textAlign:"center", marginBottom:52 }}>
            <span className="sec-label" style={{ color:G }}>{T.tmLabel}</span>
            <h2 id="tm-heading" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:"clamp(22px,3.5vw,32px)", fontWeight:800, color:txt }}>{T.tmTitle}</h2>
          </div>

          <div className="lp-3col" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
            {tmList.map((tm, i) => (
              <div key={i}
                ref={revealRef} data-rid={`tm-${i}`}
                className={`tm-card-wrap lp-reveal${revealed[`tm-${i}`]?" vis":""}`}
                style={{ transitionDelay:`${i * .15}s` }}>
                <article className="lp-tm-card" itemScope itemType="https://schema.org/Review">
                  {/* Stars */}
                  <div style={{ display:"flex", gap:3, marginBottom:14 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ color:"#F59E0B", fontSize:17 }}>★</span>)}
                  </div>
                  <p itemProp="reviewBody" style={{ fontSize:14, color:sub, lineHeight:1.8, marginBottom:20, fontStyle:"italic" }}>"{tm.text}"</p>
                  <div style={{ display:"flex", alignItems:"center", gap:12, borderTop:`1px solid ${cardBdr}`, paddingTop:16 }}>
                    <div style={{ width:42, height:42, borderRadius:"50%", background:`linear-gradient(135deg,${G},${GD})`, display:"flex", alignItems:"center", justifyContent:"center", color:"#FFFFFF", fontWeight:800, fontSize:14, flexShrink:0 }}>{tm.initials}</div>
                    <div>
                      <div itemProp="author" style={{ fontWeight:700, fontSize:14, color:txt }}>{tm.name}</div>
                      <div style={{ fontSize:12, color:muted }}>{tm.role}</div>
                    </div>
                  </div>
                </article>
              </div>
            ))}
          </div>

          {/* Animated summary stats */}
          <div ref={revealRef} data-rid="tm-stats" className={`lp-reveal${revealed["tm-stats"]?" vis":""}`}
            style={{ display:"flex", justifyContent:"center", gap:56, marginTop:52, flexWrap:"wrap" }}>
            {[
              ["১০,০০০+", "10,000+", "সন্তুষ্ট গ্রাহক", "Satisfied Customers"],
              ["৪.৯/৫", "4.9/5", "গড় রেটিং", "Average Rating"],
              ["৯৮%", "98%", "সন্তুষ্টির হার", "Satisfaction Rate"],
              ["৬৪", "64", "জেলায় কভারেজ", "Districts Covered"],
            ].map(([bn, en, lbn, len], i) => (
              <div key={bn} style={{ textAlign:"center", animation: revealed["tm-stats"] ? `lp-scaleIn .5s ease ${i*.1}s both` : "none" }}>
                <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:34, fontWeight:800, color:G, lineHeight:1 }}>{lang === "en" ? en : bn}</div>
                <div style={{ fontSize:13, color:sub, marginTop:6 }}>{lang === "en" ? len : lbn}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ LIVE ACTIVITY TICKER ════════════ */}
      <div style={{ background: dark ? "#0F1A16" : "#006A4E", padding:"12px 0", overflow:"hidden", position:"relative" }}>
        <div style={{ display:"flex", width:"max-content", animation:"lp-slide-ticker 28s linear infinite" }}>
          {[...Array(2)].map((_, gi) => (
            <div key={gi} style={{ display:"flex", gap:0 }}>
              {[
                lang==="en" ? "🏠 Home Maintenance booked in Dhaka"   : "🏠 ঢাকায় গৃহ রক্ষণাবেক্ষণ বুক হয়েছে",
                lang==="en" ? "🧹 Cleaning service confirmed"          : "🧹 পরিষ্কার সেবা নিশ্চিত হয়েছে",
                lang==="en" ? "👩‍⚕️ Healthcare provider verified"      : "👩‍⚕️ স্বাস্থ্যসেবা Provider যাচাইয়ের হয়েছে",
                lang==="en" ? "⚡ Electrical repair completed"         : "⚡ বৈদ্যুতিক মেরামত সম্পন্ন হয়েছে",
                lang==="en" ? "🧓 Elderly care arranged in Chittagong" : "🧓 চট্টগ্রামে বয়স্ক সেবা ব্যবস্থা হয়েছে",
                lang==="en" ? "📚 Tutor booked in Sylhet"             : "📚 সিলেটে গৃহশিক্ষক বুক হয়েছে",
                lang==="en" ? "🚚 Moving service in progress"          : "🚚 স্থানান্তর সেবা চলছে",
                lang==="en" ? "⭐ New 5-star review received"          : "⭐ নতুন ৫-তারা রিভিউ পাওয়া গেছে",
              ].map((item, i) => (
                <span key={i} style={{ whiteSpace:"nowrap", fontSize:13, color:"rgba(255,255,255,.88)", fontWeight:600, padding:"0 28px", borderRight:"1px solid rgba(255,255,255,.15)" }}>
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ════════════ FAQ ════════════ */}
      <section aria-labelledby="faq-heading" style={{ padding:"84px 24px", background:bg2 }}>
        <div style={{ maxWidth:760, margin:"0 auto" }}>
          <div ref={revealRef} data-rid="faq-head" className={`lp-reveal${revealed["faq-head"]?" vis":""}`}
            style={{ textAlign:"center", marginBottom:52 }}>
            <span className="sec-label" style={{ color:G }}>{T.faqLabel}</span>
            <h2 id="faq-heading" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:"clamp(22px,3.5vw,32px)", fontWeight:800, color:txt }}>{T.faqTitle}</h2>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {faqList.map((f, i) => (
              <div key={i} className="lp-faq">
                <button className="lp-faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)} aria-expanded={faqOpen === i}>
                  <span>{f.q}</span>
                  <span style={{ color:G, fontSize:22, fontWeight:400, flexShrink:0, width:22, textAlign:"center" }}>{faqOpen === i ? "−" : "+"}</span>
                </button>
                {faqOpen === i && (
                  <div className="lp-faq-a">{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ CONTACT ════════════ */}
      <section aria-labelledby="contact-heading" style={{ padding:"64px 24px", background:bg }}>
        <div style={{ maxWidth:800, margin:"0 auto" }}>
          <div ref={revealRef} data-rid="contact-head" className={`lp-reveal${revealed["contact-head"]?" vis":""}`}
            style={{ textAlign:"center", marginBottom:40 }}>
            <span className="sec-label" style={{ color:G }}>{lang === "en" ? "CONTACT US" : "যোগাযোগ করুন"}</span>
            <h2 id="contact-heading" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:"clamp(20px,3vw,28px)", fontWeight:800, color:txt }}>
              {lang === "en" ? "We're Available 24/7" : "আমরা ২৪/৭ সক্রিয়"}
            </h2>
            <p style={{ fontSize:14, color:sub, marginTop:8 }}>
              {lang === "en" ? "Reach us any time — quick response guaranteed" : "যেকোনো সময় যোগাযোগ করুন — দ্রুত উত্তরের নিশ্চয়তা"}
            </p>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }} className="lp-4col">
            <a href="https://wa.me/8801XXXXXXXXX" target="_blank" rel="noopener noreferrer" className="lp-contact-link">
              <div style={{ width:44, height:44, borderRadius:12, background:"#25D366", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>💬</div>
              <div><div style={{ fontWeight:700, fontSize:14, color:txt }}>WhatsApp</div><div style={{ fontSize:12, color:sub }}>+880 1XXX-XXXXXX</div></div>
            </a>
            <a href="tel:+8801XXXXXXXXX" className="lp-contact-link">
              <div style={{ width:44, height:44, borderRadius:12, background:"#3B82F6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>📞</div>
              <div><div style={{ fontWeight:700, fontSize:14, color:txt }}>{lang === "en" ? "Call Center" : "কল সেন্টার"}</div><div style={{ fontSize:12, color:sub }}>+880 1XXX-XXXXXX</div></div>
            </a>
            <div className="lp-contact-link" onClick={() => setAiOpen(true)}>
              <div style={{ width:44, height:44, borderRadius:12, background:`linear-gradient(135deg,${G},${GD})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🤖</div>
              <div><div style={{ fontWeight:700, fontSize:14, color:txt }}>AI Assistant</div><div style={{ fontSize:12, color:sub }}>{lang === "en" ? "Instant answers" : "তাৎক্ষণিক উত্তর"}</div></div>
            </div>
          </div>

          {/* Emergency line */}
          <div style={{ marginTop:20, padding:"16px 22px", borderRadius:12, background:dark?"rgba(232,25,44,.1)":"#FFF0F1", border:`1.5px solid ${R}33`, display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
            <span style={{ fontSize:26 }}>🚨</span>
            <div>
              <div style={{ fontWeight:700, color:R, fontSize:14 }}>{T.emergency}:</div>
              <div style={{ fontSize:13, color:dark?"#FFAAAA":"#7A0010" }}>
                999 ({lang === "en" ? "Police" : "পুলিশ"}) &nbsp;·&nbsp; 199 ({lang === "en" ? "Fire" : "ফায়ার"}) &nbsp;·&nbsp; 16430 ({lang === "en" ? "Helpline" : "হেল্পলাইন"}) &nbsp;·&nbsp; 10921 ({lang === "en" ? "Women Helpline" : "মহিলা হেল্পলাইন"})
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ CTA BANNER ════════════ */}
      <section aria-label="Call to action" style={{
        padding:"88px 24px",
        background: dark
          ? "linear-gradient(160deg,#040A06 0%,#0A1F12 50%,#06100A 100%)"
          : "linear-gradient(160deg,#003D2B 0%,#006A4E 50%,#004D38 100%)",
        borderTop:`4px solid ${R}`,
        borderBottom:`4px solid ${R}`,
      }}>
        <div ref={revealRef} data-rid="cta-content" className={`lp-reveal${revealed["cta-content"]?" vis":""}`}
          style={{ maxWidth:720, margin:"0 auto", textAlign:"center" }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.65)", letterSpacing:2.5, textTransform:"uppercase", marginBottom:14, fontWeight:700 }}>🇧🇩 {T.ctaLabel}</div>
          <h2 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:"clamp(24px,4vw,42px)", fontWeight:800, color:"#FFFFFF", lineHeight:1.2, marginBottom:16 }}>{T.ctaTitle}</h2>
          <p style={{ fontSize:"clamp(14px,1.5vw,17px)", color:"rgba(255,255,255,.78)", marginBottom:38, lineHeight:1.75 }}>{T.ctaSub}</p>
          <div className="lp-cta-btns" style={{ display:"flex", gap:16, justifyContent:"center", flexWrap:"wrap" }}>
            <button className="lp-btn lp-btn-white" onClick={onGetStarted}>🛍️ {T.ctaBtn1}</button>
            <button className="lp-btn lp-btn-ghost" onClick={onRegisterProvider}>👷 {T.ctaBtn2}</button>
          </div>
        </div>
      </section>

      {/* ════════════ FOOTER ════════════ */}
      <footer itemScope itemType="https://schema.org/Organization" style={{ background: dark ? "#060D08" : "#0A1A12", padding:"56px 24px 28px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div className="lp-footer-cols" style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:36, marginBottom:44 }}>
            {/* Brand */}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:G, display:"flex", alignItems:"center", justifyContent:"center", fontSize:21, flexShrink:0 }}>🌿</div>
                <div itemProp="name" style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:21, fontWeight:800, color:"#FFFFFF" }}>IMAP</div>
              </div>
              <p itemProp="description" style={{ fontSize:13, color:"#7FA896", lineHeight:1.8, maxWidth:240, marginBottom:20 }}>{T.footerDesc}</p>
              {/* BD Flag strip */}
              <div style={{ display:"flex", height:5, width:72, borderRadius:4, overflow:"hidden" }}>
                <div style={{ flex:1, background:"#006A4E" }}/>
                <div style={{ flex:1, background:"#FFFFFF" }}/>
                <div style={{ flex:1, background:"#E8192C" }}/>
              </div>
            </div>
            {/* Link columns */}
            {[
              { title: lang === "en" ? "Services" : "সেবা",    links: lang === "en" ? ["Emergency","Home Maintenance","Cleaning","Healthcare","Education"] : ["জরুরি সেবা","গৃহ রক্ষণাবেক্ষণ","পরিষ্কার","স্বাস্থ্যসেবা","শিক্ষা"] },
              { title: lang === "en" ? "Company" : "কোম্পানি", links: lang === "en" ? ["About Us","Careers","Blog","Press"] : ["আমাদের সম্পর্কে","ক্যারিয়ার","ব্লগ","পুরস্কার"] },
              { title: lang === "en" ? "Legal" : "আইনি",       links: lang === "en" ? ["Privacy Policy","Terms of Service","Refund Policy","Safety Guide"] : ["গোপনীয়তা নীতি","সেবার শর্ত","রিফান্ড নীতি","নিরাপত্তা"] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontWeight:700, color:"#FFFFFF", marginBottom:14, fontSize:14 }}>{col.title}</div>
                {col.links.map(l => (
                  <div key={l} style={{ fontSize:13, color:"#7FA896", marginBottom:10, cursor:"pointer", transition:"color .15s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#FFFFFF"}
                    onMouseLeave={e => e.currentTarget.style.color = "#7FA896"}>
                    {l}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Emergency numbers bar */}
          <div style={{ background:"rgba(232,25,44,.1)", border:"1px solid rgba(232,25,44,.22)", borderRadius:10, padding:"14px 20px", marginBottom:22, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <span style={{ fontSize:20 }}>🚨</span>
            <span style={{ fontWeight:700, color:"#FF6B7A", fontSize:14 }}>{T.emergency}:</span>
            <span style={{ color:"#FFAAAA", fontSize:13 }}>999 ({lang==="en"?"Police":"পুলিশ"}) · 199 ({lang==="en"?"Fire Service":"ফায়ার"}) · 16430 ({lang==="en"?"Helpline":"হেল্পলাইন"}) · 10921 ({lang==="en"?"Women":"মহিলা"})</span>
          </div>

          {/* Bottom bar */}
          <div style={{ borderTop:"1px solid rgba(255,255,255,.07)", paddingTop:20, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
            <div style={{ fontSize:12, color:"#7FA896" }}>© 2026 IMAP Bangladesh. {lang === "en" ? "All rights reserved." : "সর্বস্বত্ব সংরক্ষিত।"}</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setLang && setLang(lang === "bn" ? "en" : "bn")} style={{ background:"rgba(255,255,255,.08)", border:"none", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12, color:"#FFFFFF" }}>
                {lang === "bn" ? "English" : "বাংলা"}
              </button>
              <button onClick={() => setDark && setDark(d => !d)} style={{ background:"rgba(255,255,255,.08)", border:"none", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12, color:"#FFFFFF" }}>
                {dark ? "☀️ Light" : "🌙 Dark"}
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ════════════ FLOATING AI BUTTON ════════════ */}
      {!aiOpen && (
        <button onClick={() => setAiOpen(true)} aria-label="Open AI Assistant"
          style={{ position:"fixed", bottom:28, right:20, width:56, height:56, borderRadius:16, background:`linear-gradient(135deg,${G},${GD})`, border:"none", cursor:"pointer", fontSize:24, boxShadow:`0 6px 24px ${G}55`, zIndex:800, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s" }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1) translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
          🤖
        </button>
      )}

      {/* ════════════ AI CHAT WIDGET ════════════ */}
      {aiOpen && (
        <div role="dialog" aria-label="AI Assistant" aria-modal="true" style={{
          position:"fixed", bottom:20, right:20,
          width:340, height:480,
          background: dark ? "#112018" : "#FFFFFF",
          borderRadius:20,
          boxShadow:"0 24px 60px rgba(0,0,0,.24)",
          border:`1px solid ${cardBdr}`,
          zIndex:900, display:"flex", flexDirection:"column", overflow:"hidden",
        }}>
          {/* Header */}
          <div style={{ background:`linear-gradient(135deg,${GD},${G})`, padding:"13px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:10, background:"rgba(255,255,255,.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🤖</div>
              <div>
                <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>{T.aiTitle}</div>
                <div style={{ color:"rgba(255,255,255,.7)", fontSize:11 }}>{lang === "en" ? "Powered by IMAP AI" : "IMAP AI দ্বারা চালিত"}</div>
              </div>
            </div>
            <button onClick={() => setAiOpen(false)} aria-label="Close"
              style={{ background:"rgba(255,255,255,.2)", border:"none", borderRadius:8, width:30, height:30, cursor:"pointer", color:"#fff", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"12px", display:"flex", flexDirection:"column", gap:10 }}>
            {aiChat.map((m, i) => (
              <div key={i} style={{ display:"flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  fontSize:13, lineHeight:1.65, padding:"10px 14px", maxWidth:"86%", wordBreak:"break-word",
                  borderRadius: m.from === "bot" ? "16px 16px 16px 4px" : "16px 16px 4px 16px",
                  background: m.from === "bot"
                    ? (dark ? "rgba(0,193,112,.1)" : "#DCFCE7")
                    : `linear-gradient(135deg,${G},${GD})`,
                  color: m.from === "bot" ? txt : "#FFFFFF",
                  border: m.from === "bot" ? `1px solid ${G}22` : "none",
                }}>{m.text}</div>
              </div>
            ))}

            {/* Quick FAQ chips */}
            {aiChat.length <= 2 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
                {faqList.slice(0, 4).map((f, i) => (
                  <button key={i}
                    style={{ background:dark?"rgba(0,193,112,.08)":"#F0FDF4", border:`1px solid ${G}33`, borderRadius:16, padding:"5px 12px", fontSize:12, color:G, cursor:"pointer", fontWeight:600 }}
                    onClick={() => setAiChat(c => [...c, { from:"user", text:f.q }, { from:"bot", text:f.a }])}>
                    {f.q}
                  </button>
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Login prompt */}
          <div style={{ padding:"7px 14px", background:dark?"rgba(0,20,10,.5)":"#F0FDF4", borderTop:`1px solid ${cardBdr}`, fontSize:11, color:sub, textAlign:"center" }}>
            {lang === "en"
              ? <>Full AI after <span style={{ color:G, cursor:"pointer", fontWeight:700 }} onClick={onGetStarted}>Login →</span></>
              : <>সম্পূর্ণ AI-এর জন্য <span style={{ color:G, cursor:"pointer", fontWeight:700 }} onClick={onGetStarted}>লগইন →</span></>}
          </div>

          {/* Input */}
          <div style={{ padding:"10px 12px", display:"flex", gap:8, borderTop:`1px solid ${cardBdr}` }}>
            <input
              value={aiMsg}
              onChange={e => setAiMsg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendAi()}
              placeholder={T.aiPlaceholder}
              aria-label="Message AI"
              style={{ flex:1, border:`1.5px solid ${cardBdr}`, borderRadius:10, padding:"9px 13px", fontSize:13, background: dark ? "#0A1610" : "#FFFFFF", color:txt, outline:"none" }}
            />
            <button onClick={sendAi} aria-label="Send message"
              style={{ background:G, border:"none", borderRadius:10, width:38, height:38, cursor:"pointer", fontSize:18, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

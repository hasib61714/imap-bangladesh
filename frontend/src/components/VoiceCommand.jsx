import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { useC, LangCtx } from "../contexts";
import { T } from "../constants/translations";

/* ─── Keyword → page/action map ─────────────────────────── */
const COMMANDS = {
  bn: [
    { kw: ["হোম","প্রধান","মূল পাতা"],               page: "home" },
    { kw: ["সেবা","সার্ভিস","কী সেবা"],              page: "services" },
    { kw: ["প্রোভাইডার","সেবাদাতা","প্রদানকারী"],  page: "providers" },
    { kw: ["বুকিং","আমার বুকিং"],                    page: "bookings" },
    { kw: ["ড্যাশবোর্ড","ড্যাশ","প্রোফাইল"],         page: "dashboard" },
    { kw: ["ম্যাপ","মানচিত্র","লাইভ ম্যাপ"],         page: "map" },
    { kw: ["কাছাকাছি","নিকটবর্তী","পাশে"],           page: "nearby" },
    { kw: ["ক্যালেন্ডার","সময়সূচি","সময় বুক"],     page: "calendar" },
    { kw: ["রক্ত","ব্লাড","রক্তদান"],                page: "blood" },
    { kw: ["দুর্যোগ","বিপদ","সতর্ক"],                page: "disaster" },
    { kw: ["ওয়ালেট","পেমেন্ট","ব্যালেন্স"],         page: "wallet" },
    { kw: ["অফার","প্রোমো","কুপন","ডিসকাউন্ট"],    page: "promos" },
    { kw: ["বিশ্লেষণ","অ্যানালিটিক্স"],             page: "analytics" },
    { kw: ["সেটিং","পরিবর্তন"],                      page: "settings" },
    { kw: ["পয়েন্ট","লয়্যালটি","পুরস্কার"],        page: "loyalty" },
    { kw: ["রেফারেল","বন্ধু","আমন্ত্রণ"],           page: "referral" },
    { kw: ["জরুরি","ইমার্জেন্সি"],                   page: null, action: "emergency" },
    { kw: ["কীভাবে","হাউ"],                          page: "how" },
  ],
  en: [
    { kw: ["home","go home","main"],                   page: "home" },
    { kw: ["services","all services","browse"],         page: "services" },
    { kw: ["providers","professionals","workers"],      page: "providers" },
    { kw: ["bookings","my bookings","orders"],          page: "bookings" },
    { kw: ["dashboard","my account","profile"],        page: "dashboard" },
    { kw: ["map","live map","location"],                page: "map" },
    { kw: ["nearby","near me","close by"],              page: "nearby" },
    { kw: ["calendar","schedule","appointment"],        page: "calendar" },
    { kw: ["blood","donate","donation"],                page: "blood" },
    { kw: ["disaster","alert","warning"],               page: "disaster" },
    { kw: ["wallet","payment","balance","money"],       page: "wallet" },
    { kw: ["promo","offers","coupon","discount"],       page: "promos" },
    { kw: ["analytics","report","statistics"],          page: "analytics" },
    { kw: ["settings","preferences","setup"],           page: "settings" },
    { kw: ["loyalty","points","rewards"],               page: "loyalty" },
    { kw: ["referral","invite","refer"],                page: "referral" },
    { kw: ["emergency","help","urgent","sos"],          page: null, action: "emergency" },
    { kw: ["how","guide","how it works"],               page: "how" },
  ],
};

const PAGE_LABELS = {
  en: { home:"Home",services:"Services",providers:"Providers",bookings:"Bookings",
        dashboard:"Dashboard",map:"Map",nearby:"Nearby",calendar:"Calendar",
        blood:"Blood Donation",disaster:"Disaster Alerts",wallet:"Wallet",
        promos:"Offers",analytics:"Analytics",settings:"Settings",
        loyalty:"Points",referral:"Referral",how:"How it Works" },
  bn: { home:"হোম",services:"সেবা",providers:"প্রোভাইডার",bookings:"বুকিং",
        dashboard:"ড্যাশবোর্ড",map:"ম্যাপ",nearby:"কাছাকাছি",calendar:"ক্যালেন্ডার",
        blood:"রক্তদান",disaster:"দুর্যোগ",wallet:"ওয়ালেট",
        promos:"অফার",analytics:"বিশ্লেষণ",settings:"সেটিংস",
        loyalty:"পয়েন্ট",referral:"রেফারেল",how:"কীভাবে কাজ করে" },
};

function matchCommand(text, lang) {
  const t = text.toLowerCase();
  for (const rule of (COMMANDS[lang] || COMMANDS.bn)) {
    if (rule.kw.some(k => t.includes(k.toLowerCase()))) {
      return { page: rule.page ?? null, action: rule.action ?? null };
    }
  }
  return null;
}

/* ─── VoiceCommand floating button ──────────────────────── */
export default function VoiceCommand({ onCommand, isMobile }) {
  const C       = useC();
  const langCtx = useContext(LangCtx);
  const lang    = langCtx === T.en ? "en" : "bn";

  const [supported,  setSupported]  = useState(false);
  const [listening,  setListening]  = useState(false);
  const [liveText,   setLiveText]   = useState("");
  const [feedback,   setFeedback]   = useState(null); // { text, ok }
  const [showTip,    setShowTip]    = useState(false);

  const recRef     = useRef(null);
  const fbTimer    = useRef(null);
  const onCmdRef   = useRef(onCommand); // keep latest callback without causing re-creation
  useEffect(() => { onCmdRef.current = onCommand; }, [onCommand]);

  useEffect(() => {
    setSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  const showFeedback = useCallback((text, ok = true) => {
    setFeedback({ text, ok });
    clearTimeout(fbTimer.current);
    fbTimer.current = setTimeout(() => setFeedback(null), 3500);
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    // Stop any existing session first
    try { recRef.current?.stop(); } catch {}

    const rec = new SR();
    rec.lang            = lang === "bn" ? "bn-BD" : "en-US";
    rec.interimResults  = true;
    rec.maxAlternatives = 1;
    rec.continuous      = false;

    rec.onstart = () => { setListening(true); setLiveText(""); setFeedback(null); };

    rec.onresult = e => {
      let interim = "";
      let final   = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final   += e.results[i][0].transcript;
        else                      interim += e.results[i][0].transcript;
      }
      setLiveText(final || interim);

      if (final) {
        const match = matchCommand(final, lang);
        if (match) {
          const label = match.action === "emergency"
            ? (lang === "en" ? "🚨 Emergency!" : "🚨 ইমার্জেন্সি!")
            : (PAGE_LABELS[lang][match.page] || match.page || "");
          showFeedback(
            lang === "en" ? `→ ${label}` : `→ ${label} এ যাচ্ছি`,
            true
          );
          if (onCmdRef.current) onCmdRef.current({ transcript: final, match });
        } else {
          showFeedback(
            lang === "en"
              ? `"${final}" — not recognized`
              : `"${final}" — বোঝা যায়নি`,
            false
          );
        }
        setLiveText("");
      }
    };

    rec.onerror = e => {
      console.warn("VoiceCmd:", e.error);
      setListening(false);
      setLiveText("");
      if (e.error === "not-allowed") {
        showFeedback(
          lang === "en" ? "🎙️ Mic permission denied" : "🎙️ মাইক অনুমতি দেওয়া হয়নি",
          false
        );
      }
    };

    rec.onend = () => { setListening(false); setLiveText(""); };

    recRef.current = rec;
    try { rec.start(); } catch (err) { console.warn("SR start:", err); }
  }, [lang, showFeedback]);

  const stopListening = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    setListening(false);
    setLiveText("");
  }, []);

  // Auto-stop after 12 s
  useEffect(() => {
    if (!listening) return;
    const t = setTimeout(stopListening, 12000);
    return () => clearTimeout(t);
  }, [listening, stopListening]);

  // Position: above chat button
  const chatBottom = isMobile ? 76 : 28;
  const myBottom   = chatBottom + 62;

  // Show disabled button with tooltip if unsupported
  if (!supported) return (
    <div style={{position:"fixed",bottom:myBottom,right:18,zIndex:699}}>
      {showTip && (
        <div style={{position:"absolute",bottom:58,right:0,background:"rgba(255,255,255,.97)",border:`1px solid ${C.bdr}`,borderRadius:13,padding:"10px 14px",width:210,fontSize:11.5,color:C.sub,boxShadow:"0 6px 24px rgba(0,0,0,.13)",lineHeight:1.65,pointerEvents:"none"}}>
          <div style={{fontWeight:700,color:C.text,marginBottom:4,fontSize:12}}>🎙️ {lang==="en"?"Voice Command":"ভয়েস কমান্ড"}</div>
          <div style={{color:"#EF4444",fontSize:11}}>
            {lang==="en"
              ? "Not supported in this browser. Please use Chrome or Edge."
              : "এই ব্রাউজারে সাপোর্ট নেই। Chrome বা Edge ব্যবহার করুন।"}
          </div>
        </div>
      )}
      <button
        onMouseEnter={()=>setShowTip(true)}
        onMouseLeave={()=>setShowTip(false)}
        onClick={()=>setShowTip(t=>!t)}
        style={{width:48,height:48,borderRadius:14,background:"rgba(0,0,0,.1)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.15)",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 14px rgba(0,0,0,.10)",opacity:.75}}
        title={lang==="en"?"Voice not available in this browser":"এই ব্রাউজারে ভয়েস নেই"}
      >🎙️</button>
    </div>
  );

  return (
    <div style={{
      position: "fixed",
      bottom: myBottom,
      right: 18,
      zIndex: 699,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 7,
      pointerEvents: "none",
    }}>

      {/* Live interim text during listening */}
      {listening && liveText && (
        <div style={{
          pointerEvents: "none",
          background: "rgba(255,255,255,.97)",
          border: `2px solid ${C.p}`,
          borderRadius: 13,
          padding: "8px 13px",
          maxWidth: 200,
          fontSize: 12,
          fontWeight: 700,
          color: C.p,
          boxShadow: `0 4px 18px ${C.p}33`,
          lineHeight: 1.4,
        }}>
          {liveText}
        </div>
      )}

      {/* Pulse indicator while listening (no text yet) */}
      {listening && !liveText && (
        <div style={{
          pointerEvents: "none",
          background: "rgba(255,255,255,.97)",
          border: `2px solid ${C.p}`,
          borderRadius: 13,
          padding: "8px 13px",
          fontSize: 12,
          fontWeight: 700,
          color: C.p,
          boxShadow: `0 4px 14px ${C.p}33`,
          display: "flex",
          alignItems: "center",
          gap: 7,
          whiteSpace: "nowrap",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#EF4444",
            display: "inline-block",
            animation: "pulse 1s ease-in-out infinite",
          }}/>
          {lang === "en" ? "Listening…" : "শুনছি…"}
        </div>
      )}

      {/* Result feedback (success / error) */}
      {!listening && feedback && (
        <div style={{
          pointerEvents: "none",
          background: feedback.ok ? "#D1FAE5" : "#FEE2E2",
          border: `1px solid ${feedback.ok ? "#5DD4A0" : "#FCA5A5"}`,  
          borderRadius: 13,
          padding: "8px 13px",
          maxWidth: 210,
          fontSize: 12,
          fontWeight: 700,
          color: feedback.ok ? "#065F46" : "#B91C1C",
          boxShadow: "0 4px 14px rgba(0,0,0,.10)",
          animation: "fadeUp .25s ease",
          lineHeight: 1.4,
        }}>
          {feedback.text}
        </div>
      )}

      {/* Hover tooltip */}
      {showTip && !listening && !feedback && (
        <div style={{
          pointerEvents: "none",
          background: "rgba(255,255,255,.97)",
          border: `1px solid ${C.bdr}`,
          borderRadius: 13,
          padding: "10px 14px",
          maxWidth: 200,
          fontSize: 11.5,
          color: C.sub,
          boxShadow: "0 6px 24px rgba(0,0,0,.13)",
          lineHeight: 1.65,
        }}>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 5, fontSize: 12 }}>
            🎙️ {lang === "en" ? "Voice Command" : "ভয়েস কমান্ড"}
          </div>
          <div style={{ color: C.muted, fontSize: 11 }}>
            {lang === "en"
              ? '"bookings", "wallet", "services"'
              : '"বুকিং", "ওয়ালেট", "সেবা"'}
          </div>
        </div>
      )}

      {/* Mic button */}
      <button
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        onClick={listening ? stopListening : startListening}
        style={{
          pointerEvents: "auto",
          width: 48,
          height: 48,
          borderRadius: 14,
          background: listening
            ? "linear-gradient(135deg,#EF4444,#DC2626)"
            : `linear-gradient(135deg,${C.p}CC,${C.pdk}CC)`,
          border: "none",
          cursor: "pointer",
          fontSize: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: listening
            ? "0 4px 18px rgba(239,68,68,.55)"
            : `0 4px 18px ${C.p}44`,
          transition: "all .2s",
          animation: listening ? "pulse 1.2s ease-out infinite" : "none",
          outline: "none",
        }}
        title={lang === "en"
          ? (listening ? "Stop listening" : "Voice command")
          : (listening ? "বন্ধ করুন" : "ভয়েস কমান্ড")}
      >
        {listening ? "🔴" : "🎙️"}
      </button>
    </div>
  );
}

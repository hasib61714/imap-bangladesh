import { useState, useEffect } from "react";
import {
  Card, Button, Input, Divider, Tabs, Steps,
  message, ConfigProvider, theme as antTheme, Avatar
} from "antd";
import {
  GoogleOutlined, UserOutlined, MobileOutlined,
  MailOutlined, LockOutlined, ArrowLeftOutlined
} from "@ant-design/icons";
import { T } from "../constants/translations";
import { auth as authApi, setToken } from "../api";

const EYE_CYCLE = ["👁️","🙈","🤫","😶","🕵️","👁️"];

export default function AuthPage({ onAuth, dark, lang, setLang, onBack }) {
  const tr = T[lang] || T.bn;
  const [mode, setMode] = useState("login");
  const [method, setMethod] = useState(null);
  const [step, setStep] = useState("method");
  const [loadingKey, setLoadingKey] = useState(null);
  const loading = !!loadingKey;
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [eyeIdx, setEyeIdx] = useState(0);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [mockOtp, setMockOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(60);
  const [socialEmail, setSocialEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("customer");
  const [avatarB64, setAvatarB64] = useState("");
  const [logoTaps, setLogoTaps] = useState(0);
  const [msgApi, ctxHolder] = message.useMessage();

  useEffect(() => {
    if (typeof window.hideSplash === "function") window.hideSplash();
  }, []);

  useEffect(() => {
    if (otpSent) {
      setOtpTimer(60);
      const t = setInterval(() => setOtpTimer(p => p > 0 ? p - 1 : 0), 1000);
      return () => clearInterval(t);
    }
  }, [otpSent]);

  const tapLogo = () => setLogoTaps(t => t >= 3 ? 3 : t + 1);

  const saveAndAuth = (token, user) => {
    setToken(token);
    localStorage.setItem("imap_user", JSON.stringify(user));
    onAuth(user);
  };

  const toggleEye = () => {
    setEyeIdx(i => (i + 1) % EYE_CYCLE.length);
    setShowPass(p => !p);
  };

  const doSocialLogin = async (provider) => {
    setErr(""); setLoadingKey(provider);
    const mockEmails = { google: "user@gmail.com", facebook: "user@facebook.com" };
    const mockNames  = { google: "Google User", facebook: "Facebook User" };
    const sid = provider + "_mock_" + Date.now().toString().slice(-6);
    try {
      const res = await authApi.socialLogin(provider, sid, mockEmails[provider], mockNames[provider]);
      setLoadingKey(null);
      if (!res.isNew) { saveAndAuth(res.token, res.user); return; }
      setSocialEmail(mockEmails[provider]);
      setName(mockNames[provider]);
      setMethod(provider);
      setStep("profile");
    } catch (e) {
      setLoadingKey(null);
      setErr(e.data?.error || (lang === "bn" ? "সংযোগ ব্যর্থ" : "Connection failed"));
    }
  };

  const doEmailAuth = async () => {
    if (!email.includes("@")) { setErr(lang === "bn" ? "সঠিক Email দিন" : "Enter valid email"); return; }
    if (password.length < 6)  { setErr(lang === "bn" ? "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর" : "Password min 6 chars"); return; }
    setErr(""); setLoadingKey("email");
    try {
      if (mode === "login") {
        const res = await authApi.login(email, password);
        setLoadingKey(null);
        saveAndAuth(res.token, res.user);
      } else {
        setLoadingKey(null);
        setName(email.split("@")[0]);
        setSocialEmail(email);
        setStep("profile");
      }
    } catch (e) {
      setLoadingKey(null);
      const errMsg = e.data?.error || "";
      if (errMsg.includes("not found") || errMsg.includes("Account not found")) {
        setErr(lang === "bn"
          ? "এই Email-এ কোনো অ্যাকাউন্ট নেই। উপরে \"নিবন্ধন করুন\" ট্যাবে যান।"
          : "No account found. Click the \"Register\" tab to create one.");
      } else if (errMsg.includes("Wrong password") || errMsg.includes("password")) {
        setErr(lang === "bn" ? "পাসওয়ার্ড ভুল হয়েছে।" : "Wrong password.");
      } else {
        setErr(lang === "bn" ? "লগইন ব্যর্থ হয়েছে।" : "Login failed.");
      }
    }
  };

  const sendOtp = async () => {
    if (phone.replace(/\D/g, "").length < 11) { setErr(lang === "bn" ? "সঠিক নম্বর দিন" : "Enter valid number"); return; }
    setErr(""); setLoadingKey("otp_send");
    try {
      const res = await authApi.sendOtp(phone);
      setLoadingKey(null);
      if (res.mockOtp) setMockOtp(String(res.mockOtp));
      setOtpSent(true);
    } catch (e) {
      setLoadingKey(null);
      setErr(e.data?.error || (lang === "bn" ? "OTP পাঠাতে সমস্যা" : "OTP send failed"));
    }
  };

  const verifyOtp = async () => {
    setErr(""); setLoadingKey("otp_verify");
    try {
      const res = await authApi.verifyOtp(phone, otp.trim());
      setLoadingKey(null);
      if (res.isNew === false && res.token) {
        // existing user — backend already returned token+user
        saveAndAuth(res.token, res.user);
        return;
      }
      // new user → go to profile setup
      setStep("profile");
    } catch (e) {
      setLoadingKey(null);
      setErr(e.data?.error || (lang === "bn" ? "ভুল OTP" : "Wrong OTP"));
    }
  };

  const finishProfile = async () => {
    if (!name.trim()) { setErr(lang === "bn" ? "নাম দিন" : "Enter your name"); return; }
    setErr(""); setLoadingKey("profile");
    try {
      // For all methods (social, email, mobile): use register endpoint
      // Social users get no password (backend supports null password_hash)
      const res = await authApi.register(
        name.trim(),
        (method === "email" || method === "google" || method === "facebook") ? (socialEmail || email) : "",
        method === "email" ? password : "",
        method === "mobile" ? phone : "",
        role,
        avatarB64 || null
      );
      setLoadingKey(null);
      saveAndAuth(res.token, res.user);
    } catch (e) {
      setLoadingKey(null);
      // If account already exists, try logging in instead
      if (e.data?.error?.includes("already")) {
        try {
          const loginRes = await authApi.login(socialEmail || email || phone, password || "");
          setLoadingKey(null);
          saveAndAuth(loginRes.token, loginRes.user);
          return;
        } catch {}
      }
      setErr(e.data?.error || (lang === "bn" ? "রেজিস্ট্রেশন ব্যর্থ হয়েছে" : "Registration failed"));
    }
  };

  const doAdminLogin = async () => {
    setErr(""); setLoadingKey("admin");
    try {
      const res = await authApi.login("01700000000", "admin123");
      setLoadingKey(null);
      if (res?.token) { setToken(res.token); localStorage.setItem("imap_user", JSON.stringify(res.user)); onAuth(res.user); }
    } catch (e) {
      setLoadingKey(null);
      setErr(lang === "bn" ? "Admin login ব্যর্থ — backend চালু আছে?" : "Admin login failed");
    }
  };

  const antToken = { colorPrimary: "#16A34A", borderRadius: 12, fontFamily: "'Hind Siliguri','Noto Sans Bengali',sans-serif" };
  const bg     = dark ? "#0f172a" : "#f0fdf4";
  const cardBg = dark ? "#1e293b" : "#ffffff";

  return (
    <ConfigProvider theme={{ algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm, token: antToken }}>
      {ctxHolder}
      <style>{`
        @keyframes authFade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
        .auth-page{animation:authFade .35s ease;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 16px;background:${bg};font-family:'Hind Siliguri','Noto Sans Bengali',sans-serif}
        .auth-card .ant-card-body{padding:28px 28px 24px}
        .auth-top{position:fixed;top:14px;right:14px;display:flex;gap:8px;z-index:99}
        .s-btn{display:flex!important;align-items:center;justify-content:flex-start;gap:10px;width:100%;height:46px;border-radius:12px!important;font-size:14px;font-weight:600!important;margin-bottom:10px!important}
        .otp-input input{font-size:26px!important;letter-spacing:10px;text-align:center;font-family:monospace}
        .role-card{cursor:pointer;border-radius:14px;transition:all .2s;text-align:center;padding:14px 10px;flex:1;border:2px solid transparent}
        .role-card:hover{transform:translateY(-2px)}
        .eye-btn{font-size:18px;cursor:pointer;user-select:none;transition:transform .15s;display:inline-block}
        .eye-btn:active{transform:scale(1.4) rotate(15deg)}
      `}</style>

      <div className="auth-top">
        {onBack && (
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ borderRadius: 20 }}>
            {lang === "bn" ? "হোম" : "Home"}
          </Button>
        )}
        <Button size="small" type="primary" onClick={() => setLang(lang === "bn" ? "en" : "bn")} style={{ borderRadius: 20, fontWeight: 700 }}>
          {lang === "bn" ? "EN" : "বাং"}
        </Button>
      </div>

      <div className="auth-page">
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 54, cursor: "default", userSelect: "none", lineHeight: 1 }} onClick={tapLogo}>🌿</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#16A34A", marginTop: 6, letterSpacing: -0.5 }}>IMAP AI Powered Service Platform</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>🇧🇩 {lang === "bn" ? "বাংলাদেশের এআই-পাওয়ার্ড সার্ভিস প্ল্যাটফর্ম" : "Bangladesh"}</div>
          {logoTaps >= 3 && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 5, fontWeight: 700 }}>🔓 {lang === "bn" ? "গোপন মোড সক্রিয়" : "Secret mode active"}</div>}
        </div>

        <Card className="auth-card" style={{ width: "100%", maxWidth: 420, background: cardBg, borderRadius: 22, boxShadow: "0 12px 40px rgba(0,0,0,.12)" }} bordered={false}>

          {/* ── ADMIN SECRET ─────────────────────────────── */}
          {logoTaps >= 3 ? (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 8 }}>🔐</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#4338CA", marginBottom: 4 }}>
                {lang === "bn" ? "প্রশাসক প্রবেশ" : "Admin Access"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 24 }}>
                {lang === "bn" ? "গোপন অ্যাক্সেস সক্রিয় হয়েছে" : "Secret access activated"}
              </div>
              {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 14 }}>{err}</div>}
              <Button type="primary" loading={loadingKey === "admin"} block size="large"
                style={{ borderRadius: 14, background: "#4338CA", borderColor: "#4338CA", fontWeight: 700, fontSize: 16, height: 52, marginBottom: 14 }}
                onClick={doAdminLogin}>
                🔑 {lang === "bn" ? "অ্যাডমিন লগইন" : "Admin Login"}
              </Button>
              <Button block style={{ borderRadius: 12 }} icon={<ArrowLeftOutlined />} onClick={() => setLogoTaps(0)}>
                {lang === "bn" ? "ফিরে যান" : "Back"}
              </Button>
            </div>

          ) : step === "method" ? (
            /* ── LOGIN/REGISTER ─────────────────────────── */
            <>
              <Tabs centered activeKey={mode} onChange={k => { setMode(k); setErr(""); setMethod(null); setOtpSent(false); }}
                items={[
                  { key: "login",    label: <span style={{ fontWeight: 700, fontSize: 14 }}>{tr.authLogin}</span> },
                  { key: "register", label: <span style={{ fontWeight: 700, fontSize: 14 }}>{tr.authReg}</span>   },
                ]}
              />

              {/* Social */}
              <Button className="s-btn" onClick={() => doSocialLogin("google")} loading={loadingKey === "google"} disabled={!!loadingKey && loadingKey !== "google"}
                style={{ border: "1.5px solid #e5e7eb", background: dark ? "#1e293b" : "#fff", color: dark ? "#fff" : "#374151" }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {tr.authGoogle}
              </Button>
              <Button className="s-btn" onClick={() => doSocialLogin("facebook")} loading={loadingKey === "facebook"} disabled={!!loadingKey && loadingKey !== "facebook"}
                style={{ background: "#1877F2", borderColor: "#1877F2", color: "#fff" }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                {tr.authFacebook}
              </Button>

              <Divider style={{ margin: "12px 0", fontSize: 12, color: "#9ca3af" }}>{tr.authOr}</Divider>

              {/* Email */}
              {method === "email" ? (
                <>
                  <Input prefix={<MailOutlined style={{ color: "#9ca3af" }} />} placeholder={tr.authEmailPh || "your@gmail.com"}
                    value={email} onChange={e => setEmail(e.target.value)} size="large" style={{ borderRadius: 12, marginBottom: 12 }} />
                  <Input
                    prefix={<LockOutlined style={{ color: "#9ca3af" }} />}
                    suffix={
                      <span className="eye-btn" onClick={toggleEye} title={lang === "bn" ? "ক্লিক করুন 😏" : "Click me 😏"}>
                        {EYE_CYCLE[eyeIdx]}
                      </span>
                    }
                    type={showPass ? "text" : "password"}
                    placeholder={tr.authPasswordPh}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onPressEnter={doEmailAuth}
                    size="large"
                    style={{ borderRadius: 12, marginBottom: 12 }}
                  />
                  {mode === "login" && (
                    <div style={{ textAlign: "right", fontSize: 12, color: "#16A34A", cursor: "pointer", marginBottom: 10, fontWeight: 600 }}>
                      {tr.authForgot}
                    </div>
                  )}
                  {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 10 }}>{err}</div>}
                  <Button type="primary" block size="large" loading={loadingKey === "email"} onClick={doEmailAuth}
                    style={{ borderRadius: 12, fontWeight: 700, height: 46, marginBottom: 10 }}>
                    {mode === "login" ? tr.authLogin : tr.authReg}
                  </Button>
                  <Button block icon={<ArrowLeftOutlined />} style={{ borderRadius: 12 }} onClick={() => { setMethod(null); setErr(""); }}>
                    {lang === "bn" ? "ফিরে যান" : "Back"}
                  </Button>
                </>
              ) : (
                <Button className="s-btn" onClick={() => { setMethod("email"); setErr(""); }}
                  style={{ border: "1.5px solid #e5e7eb", background: dark ? "#1e293b" : "#fff", color: dark ? "#fff" : "#374151", marginBottom: 10 }}>
                  <MailOutlined style={{ color: "#16A34A", fontSize: 18 }} /> {tr.authEmail}
                </Button>
              )}

              {/* Mobile OTP */}
              {method === "mobile" ? (
                <div style={{ marginTop: 4 }}>
                  {!otpSent ? (
                    <>
                      <Input prefix={<MobileOutlined style={{ color: "#9ca3af" }} />} placeholder="01XXXXXXXXX"
                        value={phone} onChange={e => setPhone(e.target.value)} onPressEnter={sendOtp}
                        size="large" style={{ borderRadius: 12, marginBottom: 12 }} />
                      {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 10 }}>{err}</div>}
                      <Button type="primary" block size="large" loading={loadingKey === "otp_send"} onClick={sendOtp}
                        style={{ borderRadius: 12, fontWeight: 700, height: 46, marginBottom: 10 }}>
                        {lang === "bn" ? "OTP পাঠান" : "Send OTP"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div style={{ background: dark ? "#0f3a28" : "#f0fdf4", borderRadius: 12, padding: "12px 16px", marginBottom: 14, textAlign: "center", border: "1.5px solid #16A34A" }}>
                        <div style={{ fontSize: 11, color: "#16A34A", fontWeight: 700 }}>{lang === "bn" ? "পরীক্ষার OTP" : "Demo OTP"}</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: "#16A34A", letterSpacing: 6 }}>{mockOtp}</div>
                      </div>
                      <Input className="otp-input" maxLength={6} placeholder="• • • • • •"
                        value={otp} onChange={e => setOtp(e.target.value)} onPressEnter={verifyOtp}
                        size="large" style={{ borderRadius: 12, marginBottom: 12, textAlign: "center" }} />
                      {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>{err}</div>}
                      <Button type="primary" block size="large" onClick={verifyOtp} loading={loadingKey === "otp_verify"}
                        style={{ borderRadius: 12, fontWeight: 700, height: 46, marginBottom: 8 }}>
                        {tr.authVerify}
                      </Button>
                      <div style={{ textAlign: "center", fontSize: 12, color: "#6b7280" }}>
                        {otpTimer > 0
                          ? <span>⏳ {otpTimer} {tr.authTimer}</span>
                          : <span onClick={() => { setOtpSent(false); setOtp(""); }} style={{ color: "#16A34A", cursor: "pointer", fontWeight: 600 }}>{tr.authResend}</span>
                        }
                      </div>
                    </>
                  )}
                  <Button block icon={<ArrowLeftOutlined />} style={{ borderRadius: 12, marginTop: 10 }}
                    onClick={() => { setMethod(null); setOtpSent(false); setErr(""); }}>
                    {lang === "bn" ? "ফিরে যান" : "Back"}
                  </Button>
                </div>
              ) : (
                !method && (
                  <Button className="s-btn" onClick={() => { setMethod("mobile"); setErr(""); }}
                    style={{ border: "1.5px solid #e5e7eb", background: dark ? "#1e293b" : "#fff", color: dark ? "#fff" : "#374151" }}>
                    <MobileOutlined style={{ color: "#16A34A", fontSize: 18 }} /> {tr.authMobile}
                  </Button>
                )
              )}

              {!method && (
                <div style={{ marginTop: 14, padding: "10px 14px", background: dark ? "#0f2a1a" : "#f0fdf4", borderRadius: 10, fontSize: 11, color: "#16A34A", textAlign: "center", border: "1px solid #bbf7d0" }}>
                  {tr.authSocialNote}
                </div>
              )}
            </>

          ) : (
            /* ── PROFILE SETUP ──────────────────────────── */
            <>
              <Steps current={1} size="small" style={{ marginBottom: 22 }}
                items={[
                  { title: lang === "bn" ? "পদ্ধতি" : "Method" },
                  { title: lang === "bn" ? "প্রোফাইল" : "Profile" },
                ]}
              />
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <label style={{ cursor: "pointer", display: "inline-block" }}>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                    const f = e.target.files[0]; if (!f) return;
                    const r = new FileReader(); r.onload = ev => setAvatarB64(ev.target.result); r.readAsDataURL(f);
                  }} />
                  <Avatar size={80} src={avatarB64 || undefined} icon={!avatarB64 ? <UserOutlined /> : undefined}
                    style={{ border: "3px solid #16A34A", cursor: "pointer", background: avatarB64 ? "transparent" : "#dcfce7" }} />
                  <div style={{ fontSize: 11, color: "#16A34A", fontWeight: 600, marginTop: 6 }}>
                    {lang === "bn" ? "📷 ছবি আপলোড করুন" : "📷 Upload photo"}
                  </div>
                </label>
              </div>

              <Input prefix={<UserOutlined style={{ color: "#9ca3af" }} />}
                placeholder={lang === "bn" ? "পূর্ণ নাম লিখুন" : "Enter full name"}
                value={name} onChange={e => setName(e.target.value)} size="large"
                style={{ borderRadius: 12, marginBottom: 16 }} />

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, marginBottom: 10 }}>
                  {lang === "bn" ? "আপনার ভূমিকা বেছে নিন" : "Select your role"}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { v: "customer", icon: "🛍️", bn: "সেবাগ্রহণকারী",  en: "Customer",        desc: lang === "bn" ? "সেবা নিন" : "Get services" },
                    { v: "provider", icon: "👷", bn: "সেবাদানকারী",    en: "Service Provider", desc: lang === "bn" ? "সেবা দিন" : "Give services" },
                  ].map(r => (
                    <div key={r.v} className="role-card" onClick={() => setRole(r.v)}
                      style={{
                        flex: 1, textAlign: "center", padding: "14px 10px", cursor: "pointer",
                        borderRadius: 14, border: `2px solid ${role === r.v ? "#16A34A" : "#e5e7eb"}`,
                        background: role === r.v ? "#f0fdf4" : (dark ? "#1e293b" : "#fff"),
                        boxShadow: role === r.v ? "0 0 0 3px #bbf7d044" : "none", transition: "all .2s",
                      }}>
                      <div style={{ fontSize: 28, marginBottom: 4 }}>{r.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: role === r.v ? "#16A34A" : "#374151" }}>
                        {lang === "bn" ? r.bn : r.en}
                      </div>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{r.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>{err}</div>}
              <Button type="primary" block size="large" loading={loadingKey === "profile"} onClick={finishProfile}
                style={{ borderRadius: 12, fontWeight: 700, height: 48, marginBottom: 12 }}>
                🎉 {lang === "bn" ? "শুরু করুন" : "Get Started"}
              </Button>
              <Button block icon={<ArrowLeftOutlined />} style={{ borderRadius: 12 }}
                onClick={() => { setStep("method"); setMethod(null); }}>
                {lang === "bn" ? "ফিরে যান" : "Back"}
              </Button>
            </>
          )}
        </Card>

        {logoTaps < 3 && (
          <div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center" }}>
            {["method", "profile"].map(s => (
              <div key={s} style={{ width: step === s ? 28 : 8, height: 8, borderRadius: 4, background: step === s ? "#16A34A" : "#d1d5db", transition: "all .3s" }} />
            ))}
          </div>
        )}
      </div>
    </ConfigProvider>
  );
}

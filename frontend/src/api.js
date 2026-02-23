// ─────────────────────────────────────────────────────────────
//  IMAP Bangladesh – Frontend API client
//  All calls go to http://localhost:5000/api
// ─────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// ── Token helpers ─────────────────────────────────────────────
export const getToken  = ()           => localStorage.getItem("imap_token");
export const setToken  = (t)          => localStorage.setItem("imap_token", t);
export const clearToken= ()           => localStorage.removeItem("imap_token");

// ── Core fetch wrapper ────────────────────────────────────────
async function req(method, path, body = null, isForm = false) {
  const token = getToken();
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status, data });
  return data;
}

const get  = (p)    => req("GET",    p);
const post = (p, b) => req("POST",   p, b);
const put  = (p, b) => req("PUT",    p, b);
const patch= (p, b) => req("PATCH",  p, b);
const del  = (p)    => req("DELETE", p);

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════
export const auth = {
  /** Register a new account */
  register: (name, email, password, phone, role, avatar) =>
    post("/auth/register", { name, email, password, phone, role, avatar }),

  /** Login with email or phone + password */
  login: (identifier, password) =>
    post("/auth/login", { identifier, password }),

  /** Social login (Google / Facebook mock) */
  socialLogin: (provider, socialId, email, name, avatar) =>
    post("/auth/social-login", { provider, socialId, email, name, avatar }),

  /** Send OTP to phone */
  sendOtp: (phone) =>
    post("/auth/send-otp", { phone }),

  /** Verify OTP */
  verifyOtp: (phone, otp) =>
    post("/auth/verify-otp", { phone, otp }),

  /** Get current logged-in user (checks token) */
  me: () => get("/auth/me"),
};

// ═══════════════════════════════════════════════════════════════
//  USERS / PROFILE
// ═══════════════════════════════════════════════════════════════
export const users = {
  getProfile: ()       => get("/users/profile"),
  updateProfile: (data)=> put("/users/profile", data),
  updateAvatar: (b64)  => put("/users/avatar", { avatar: b64 }),

  getWallet: ()              => get("/users/wallet"),
  topup:     (amount, method)=> post("/users/wallet/topup",    { amount, method }),
  withdraw:  (amount, notes) => post("/users/wallet/withdraw", { amount, notes }),

  getNotifications: ()    => get("/users/notifications"),
  markNotifRead:    ()    => put("/users/notifications/read"),
  markNotifReadById:(id)  => patch(`/users/notifications/${id}/read`),
  getLoyalty:       ()    => get("/users/loyalty"),
  redeemPoints:     (pts, code) => post("/users/loyalty/redeem", { pts, code }),
  getReferral:      ()    => get("/users/referral"),
  submitComplaint:  (data)=> post("/users/complaints", data),
  saveSettings:     (data)=> put("/users/settings", data),
};

// ═══════════════════════════════════════════════════════════════
//  PROVIDERS
// ═══════════════════════════════════════════════════════════════
export const providers = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get(`/providers${qs ? "?" + qs : ""}`);
  },
  getMe: ()            => get("/providers/me"),
  get: (id)            => get(`/providers/${id}`),
  updateMe: (data)     => put("/providers/me", data),
  apply:    (data)     => post("/providers/apply", data),
  myJobs: (params = {})=> get(`/providers/me/jobs?${new URLSearchParams(params)}`),
};

// ═══════════════════════════════════════════════════════════════
//  BOOKINGS
// ═══════════════════════════════════════════════════════════════
export const bookings = {
  create: (data)       => post("/bookings", data),
  list: (params = {})  => get(`/bookings?${new URLSearchParams(params)}`),
  get: (id)            => get(`/bookings/${id}`),
  updateStatus: (id, status, note) => patch(`/bookings/${id}/status`, { status, note }),
};

// ═══════════════════════════════════════════════════════════════
//  KYC
// ═══════════════════════════════════════════════════════════════
export const kyc = {
  get: ()              => get("/kyc"),
  submit: (data)       => post("/kyc", data),
  review: (id, status, rejection_reason) =>
    patch(`/kyc/${id}`, { status, rejection_reason }),
};

// ═══════════════════════════════════════════════════════════════
//  REVIEWS
// ═══════════════════════════════════════════════════════════════
export const reviews = {
  submit: (data)       => post("/reviews", data),
  getByProvider: (id)  => get(`/reviews/provider/${id}`),
};

// ═══════════════════════════════════════════════════════════════
//  SERVICES / CATEGORIES
// ═══════════════════════════════════════════════════════════════
export const services = {
  list: (all = false)  => get(all ? "/services?all=1" : "/services"),
  create: (data)       => post("/services", data),
  update: (id, data)   => put(`/services/${id}`, data),
  remove: (id)         => del(`/services/${id}`),
};

// ═══════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════
export const admin = {
  stats:       ()               => get("/admin/stats"),
  providers:   (p = {})        => get(`/admin/providers?${new URLSearchParams(p)}`),
  users:       (p = {})        => get(`/admin/users?${new URLSearchParams(p)}`),
  updateUser:  (id, data)      => patch(`/admin/users/${id}`, data),
  bookings:    (p = {})        => get(`/admin/bookings?${new URLSearchParams(p)}`),
  kyc:         (p = {})        => get(`/admin/kyc?${new URLSearchParams(p)}`),
  complaints:  (p = {})        => get(`/admin/complaints?${new URLSearchParams(p)}`),
  resolveComp: (id, data)      => patch(`/admin/complaints/${id}`, data),
  notify:      (data)          => post("/admin/notify", data),
  revenue:     ()               => get("/admin/revenue"),
  promoList:   ()               => get("/admin/promos"),
  promoCreate: (data)           => post("/admin/promos", data),
  promoToggle: (id, d)          => patch(`/admin/promos/${id}`, d),
  promoDelete: (id)             => del(`/admin/promos/${id}`),
};

// ═══════════════════════════════════════════════════════════════
//  AI — all features
// ═══════════════════════════════════════════════════════════════
export const ai = {
  /** Chatbot: pass [{role, content}] message history + lang "bn"|"en" */
  chat: (messages, lang = "bn") =>
    post("/ai/chat", { messages, lang }),

  /**
   * Streaming chatbot — async generator, yields text chunks as they arrive.
   * Usage:  for await (const chunk of ai.chatStream(msgs, "bn")) { ... }
   */
  chatStream: async function* (messages, lang = "bn") {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${BASE}/ai/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, lang }),
    });

    if (!res.ok || !res.body) {
      yield lang === "bn" ? "দুঃখিত, সমস্যা হয়েছে।" : "Sorry, an error occurred.";
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep partial last line

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (raw === "[DONE]") return;
        try {
          const json = JSON.parse(raw);
          if (json.text) yield json.text;
        } catch {}
      }
    }
  },

  /** Smart provider matching with AI score */
  match: (serviceType, area, userId, limit = 10) =>
    post("/ai/match", { serviceType, area, userId, limit }),

  /** Dynamic pricing for a service type */
  dynamicPrice: (serviceType, area = "", scheduledTime = null) =>
    post("/ai/dynamic-price", { serviceType, area, scheduledTime }),

  /** Fraud check before confirming booking */
  fraudCheck: (userId, providerId, amount, serviceType) =>
    post("/ai/fraud-check", { userId, providerId, amount, serviceType }),

  /** Check if a review might be fake before submission */
  reviewCheck: (providerId, rating, comment, userId) =>
    post("/ai/review-check", { providerId, rating, comment, userId }),

  /** Admin: demand + revenue forecast */
  forecast: () => get("/ai/forecast"),

  /** Admin: churn risk providers & customers */
  churn: () => get("/ai/churn"),

  /** Admin: area demand heatmap */
  heatmap: () => get("/ai/heatmap"),

  /** Bundle suggestions after booking a service */
  bundleSuggest: (serviceType) =>
    post("/ai/bundle-suggest", { serviceType }),
};

export const blood = {
  /** List donors, optionally filter by blood_group */
  getDonors: (group) => get(`/blood${group && group !== "all" ? `?group=${encodeURIComponent(group)}` : ""}`),
  /** Register current user as a donor */
  register:  (data) => post("/blood/register", data),
  /** Send a blood request */
  request:   (data) => post("/blood/request", data),
};

export const disaster = {
  /** Fetch active disaster alerts */
  getAlerts: () => get("/disaster/alerts"),
  /** Submit a disaster report */
  report:    (type, description, area, severity) =>
    post("/disaster/report", { type, description, area, severity }),
};

export const chat = {
  /** Fetch messages for a booking (pass `after` id for long-polling) */
  getMessages: (bookingId, after) =>
    get(`/chat/${bookingId}${after ? `?after=${after}` : ""}`),
  /** Send a message */
  send: (bookingId, message) => post(`/chat/${bookingId}`, { message }),
};

export const promos = {
  /** List all active promos */
  getAll:    () => get("/promos"),
  /** Validate a code server-side */
  validate:  (code) => post("/promos/validate", { code }),
};

export const schedule = {
  /** Get my schedule (provider) */
  get:       () => get("/schedule"),
  /** Toggle a slot's availability */
  toggle:    (slotId, avail) => patch(`/schedule/${slotId}`, { avail }),
  /** Get a provider's public schedule */
  forProvider: (providerId) => get(`/schedule/provider/${providerId}`),
};

export const sos = {
  /** Send SOS alert (auth required) */
  send: (type, description, booking_id, lat, lng) =>
    post("/sos", { type, description, booking_id, lat, lng }),
  /** List all SOS alerts (admin only) */
  list: (status) => get("/sos" + (status ? `?status=${status}` : "")),
  /** Update alert status (admin only) */
  update: (id, status, admin_note) => patch(`/sos/${id}`, { status, admin_note }),
};

export const payments = {
  /** Initiate payment for a booking */
  initiate: (booking_id, payment_method = "sslcommerz") =>
    post("/payments/initiate", { booking_id, payment_method }),
  /** List my payment history */
  list: (page = 1) => get(`/payments?page=${page}`),
  /** Get single payment detail */
  get: (id) => get(`/payments/${id}`),
  /** Admin: list all payments */
  adminList: (status, page = 1) =>
    get(`/payments/admin/all?page=${page}${status ? `&status=${status}` : ""}`),
};

export const upload = {
  /** Upload avatar image */
  avatar: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return req("POST", "/upload/avatar", fd, true);
  },
  /** Upload KYC documents (files: {nid_front, nid_back, selfie, certificate}; extras: doc_type, doc_number) */
  kyc: async (files) => {
    const fd = new FormData();
    const fileFields = ["nid_front","nid_back","selfie","certificate"];
    for (const [field, val] of Object.entries(files)) {
      if (!val) continue;
      if (fileFields.includes(field)) fd.append(field, val);   // File object
      else fd.append(field, val);                               // String metadata
    }
    return req("POST", "/upload/kyc", fd, true);
  },
  /** Upload booking completion proof */
  proof: async (file, booking_id) => {
    const fd = new FormData();
    fd.append("file", file);
    if (booking_id) fd.append("booking_id", booking_id);
    return req("POST", "/upload/proof", fd, true);
  },
  /** Check storage config status */
  status: () => get("/upload/status"),
};

export default { auth, users, providers, bookings, kyc, reviews, services, admin, ai, blood, disaster, chat, promos, schedule, sos, payments, upload };

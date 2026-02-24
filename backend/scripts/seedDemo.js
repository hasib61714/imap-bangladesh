/**
 * seedDemo.js  –  Populates the database with realistic demo providers/users
 * Safe to run multiple times (idempotent – uses INSERT IGNORE / ON DUPLICATE KEY)
 * Run: node scripts/seedDemo.js
 */
require("dotenv").config();
const mysql  = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const sslConfig = process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : false;

async function seed() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "localhost",
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME     || "imap_db",
    charset:  "utf8mb4",
    ssl:      sslConfig || undefined,
    multipleStatements: false,
  });
  console.log("✅ Connected");

  // ── 1. CATEGORIES ──────────────────────────────────────────────
  const cats = [
    { id: "cat-electric",  name_bn: "ইলেকট্রিক",       name_en: "Electrical",      slug: "electrical",  icon: "⚡" },
    { id: "cat-plumber",   name_bn: "প্লাম্বার",         name_en: "Plumbing",        slug: "plumbing",    icon: "🔧" },
    { id: "cat-cleaning",  name_bn: "পরিষ্কার",          name_en: "Cleaning",        slug: "cleaning",    icon: "🧹" },
    { id: "cat-nurse",     name_bn: "নার্সিং / চিকিৎসা", name_en: "Medical / Nurse", slug: "medical",     icon: "🏥" },
    { id: "cat-tutor",     name_bn: "গৃহশিক্ষক",         name_en: "Tutoring",        slug: "tutoring",    icon: "📚" },
    { id: "cat-carpenter", name_bn: "কাঠমিস্ত্রি",       name_en: "Carpentry",       slug: "carpentry",   icon: "🪚" },
    { id: "cat-painting",  name_bn: "রঙের কাজ",          name_en: "Painting",        slug: "painting",    icon: "🎨" },
    { id: "cat-ac",        name_bn: "এসি মেরামত",        name_en: "AC Repair",       slug: "ac_repair",   icon: "❄️" },
  ];
  for (const c of cats) {
    await conn.query(
      `INSERT INTO categories (id, name_bn, name_en, slug, icon)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name_bn=VALUES(name_bn), name_en=VALUES(name_en), icon=VALUES(icon)`,
      [c.id, c.name_bn, c.name_en, c.slug, c.icon]
    ).catch(() => {});
  }
  console.log("✅ Categories seeded");

  // ── 2. DEMO PROVIDER DEFINITIONS ────────────────────────────────
  const hash = await bcrypt.hash("demo1234", 10);
  const providers = [
    {
      phone: "01700000001", name: "মো. রাকিব হোসেন",
      service_type_bn: "ইলেকট্রিক মেরামত ও ওয়্যারিং",
      service_type_en: "Electrical Repair & Wiring",
      area_bn: "মিরপুর, ঢাকা",  area_en: "Mirpur, Dhaka",
      bio_bn: "৭ বছরের অভিজ্ঞ ইলেকট্রিশিয়ান। ঢাকার সকল এলাকায় সেবা দেই।",
      bio_en: "7-year experienced electrician serving all Dhaka areas.",
      hourly_rate: 450, experience_yrs: 7, rating: 4.9, total_jobs: 847, cat_slug: "electrical",
    },
    {
      phone: "01700000002", name: "ফারজানা বেগম",
      service_type_bn: "নার্সিং ও হোম কেয়ার",
      service_type_en: "Nursing & Home Care",
      area_bn: "গুলশান, উত্তরা, ঢাকা",  area_en: "Gulshan, Uttara, Dhaka",
      bio_bn: "পেশাদার নার্স — বয়স্ক সেবা ও পোস্ট-অপারেটিভ কেয়ারে বিশেষজ্ঞ।",
      bio_en: "Professional nurse specialising in elderly and post-operative care.",
      hourly_rate: 600, experience_yrs: 5, rating: 4.8, total_jobs: 631, cat_slug: "medical",
    },
    {
      phone: "01700000003", name: "আলী হোসেন",
      service_type_bn: "প্লাম্বিং ও পানির লাইন মেরামত",
      service_type_en: "Plumbing & Water Line Repair",
      area_bn: "ধানমন্ডি, মোহাম্মদপুর",  area_en: "Dhanmondi, Mohammadpur",
      bio_bn: "১০ বছরের অভিজ্ঞ প্লাম্বার — তাৎক্ষণিক সেবা পাওয়া যায়।",
      bio_en: "10-year experienced plumber — emergency service available.",
      hourly_rate: 380, experience_yrs: 10, rating: 4.7, total_jobs: 512, cat_slug: "plumbing",
    },
    {
      phone: "01700000004", name: "নাসরিন আক্তার",
      service_type_bn: "গভীর পরিষ্কার ও হাউসকিপিং",
      service_type_en: "Deep Cleaning & Housekeeping",
      area_bn: "বনানী, বারিধারা",  area_en: "Banani, Baridhara",
      bio_bn: "পেশাদার পরিষ্কারকর্মী — শতভাগ সন্তুষ্টি নিশ্চিত।",
      bio_en: "Professional cleaner with 100% satisfaction guarantee.",
      hourly_rate: 300, experience_yrs: 5, rating: 4.7, total_jobs: 285, cat_slug: "cleaning",
    },
    {
      phone: "01700000005", name: "কামাল উদ্দিন",
      service_type_bn: "গণিত ও বিজ্ঞান শিক্ষক",
      service_type_en: "Math & Science Tutor",
      area_bn: "লালমাটিয়া, আজিমপুর",  area_en: "Lalmatia, Azimpur",
      bio_bn: "SSC-HSC বিশেষজ্ঞ শিক্ষক — ৮ বছরের অভিজ্ঞতা।",
      bio_en: "SSC-HSC specialist teacher — 8 years of experience.",
      hourly_rate: 350, experience_yrs: 8, rating: 4.8, total_jobs: 198, cat_slug: "tutoring",
    },
    {
      phone: "01700000006", name: "রশিদ মিয়া",
      service_type_bn: "কাঠের আসবাবপত্র ও মেরামত",
      service_type_en: "Furniture Carpentry & Repair",
      area_bn: "পুরান ঢাকা, কামরাঙ্গীরচর",  area_en: "Old Dhaka, Kamrangirchar",
      bio_bn: "দক্ষ কাঠমিস্ত্রি — কাস্টম আসবাবপত্র ও মেরামতে বিশেষজ্ঞ।",
      bio_en: "Skilled carpenter specialising in custom furniture and repair.",
      hourly_rate: 420, experience_yrs: 12, rating: 4.6, total_jobs: 340, cat_slug: "carpentry",
    },
  ];

  let created = 0, updated = 0;
  for (const p of providers) {
    // Check if user already exists
    const [ex] = await conn.query("SELECT id, role FROM users WHERE phone = ?", [p.phone]);
    let userId;

    if (ex.length) {
      userId = ex[0].id;
    } else {
      userId = uuidv4();
      const refCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      await conn.query(
        `INSERT INTO users (id, name, phone, password_hash, role, is_active, referral_code)
         VALUES (?,?,?,?,'provider',1,?)`,
        [userId, p.name, p.phone, hash, refCode]
      );
      created++;
    }

    // Get category id
    const [catRow] = await conn.query("SELECT id FROM categories WHERE slug = ?", [p.cat_slug]);
    const catId = catRow[0]?.id || null;

    // Upsert provider profile
    const [provEx] = await conn.query("SELECT id FROM providers WHERE user_id = ?", [userId]);
    if (provEx.length) {
      await conn.query(
        `UPDATE providers SET
          service_type_bn=?, service_type_en=?,
          area_bn=?, area_en=?,
          bio_bn=?, bio_en=?,
          hourly_rate=?, experience_yrs=?,
          rating=?, total_jobs=?,
          is_available=1, nid_verified=1, trust_score=90,
          category_id=?
         WHERE user_id=?`,
        [p.service_type_bn, p.service_type_en,
         p.area_bn, p.area_en,
         p.bio_bn, p.bio_en,
         p.hourly_rate, p.experience_yrs,
         p.rating, p.total_jobs,
         catId, userId]
      );
      updated++;
    } else {
      const pid = uuidv4();
      await conn.query(
        `INSERT INTO providers
          (id, user_id, service_type_bn, service_type_en,
           area_bn, area_en, bio_bn, bio_en,
           hourly_rate, experience_yrs,
           rating, total_jobs,
           is_available, nid_verified, trust_score, category_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,1,90,?)`,
        [pid, userId,
         p.service_type_bn, p.service_type_en,
         p.area_bn, p.area_en,
         p.bio_bn, p.bio_en,
         p.hourly_rate, p.experience_yrs,
         p.rating, p.total_jobs,
         catId]
      );
      created++;
    }

    console.log(`  ✓ ${p.name} (${p.service_type_en})`);
  }

  // ── 3. FIX EXISTING PROVIDERS that have empty service/area ─────
  const fixes = [
    { phone: "01700000007", svc_bn: "ইলেকট্রিক সেবা",     svc_en: "Electrical Service",  area_bn: "ঢাকা", area_en: "Dhaka" },
  ];
  // Generic fix: update any provider where both fields are empty
  const [emptyProviders] = await conn.query(
    `SELECT p.id, p.user_id, u.name FROM providers p JOIN users u ON u.id = p.user_id
     WHERE (p.service_type_bn IS NULL OR p.service_type_bn = '')
       AND (p.service_type_en IS NULL OR p.service_type_en = '')`
  );
  for (const ep of emptyProviders) {
    await conn.query(
      `UPDATE providers SET
        service_type_bn='সাধারণ সেবা', service_type_en='General Service',
        area_bn='ঢাকা', area_en='Dhaka',
        bio_bn='অভিজ্ঞ পেশাদার সেবাদাতা।', bio_en='Experienced professional.',
        hourly_rate=400, is_available=1, trust_score=80
       WHERE id=?`,
      [ep.id]
    );
    console.log(`  🔧 Fixed empty profile: ${ep.name}`);
    updated++;
  }

  console.log(`\n🎉 Done — ${created} created, ${updated} updated`);
  await conn.end();
}

seed().catch(err => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});

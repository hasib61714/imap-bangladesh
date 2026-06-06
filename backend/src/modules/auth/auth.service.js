// ── auth.service — BUSINESS LOGIC ONLY ────────────────────
// No HTTP (req/res) and no direct DB. Dependencies are injected, which keeps
// the service pure and unit-testable with a fake repository.
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const httpError = (status, message) => Object.assign(new Error(message), { status });
const makeReferralCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

/**
 * @param {object} deps
 * @param {object} deps.repo            auth.repository
 * @param {(user:object)=>string} deps.signAccessToken
 * @param {(userId:string)=>Promise<string|undefined>} deps.issueRefresh
 */
function createAuthService({ repo, signAccessToken, issueRefresh }) {
  return {
    async login(identifier, password) {
      if (!identifier) throw httpError(400, "Email or phone required");
      const user = await repo.findActiveByIdentifier(identifier);
      if (!user) throw httpError(401, "Account not found");
      if (user.password_hash) {
        const ok = await bcrypt.compare(password || "", user.password_hash);
        if (!ok) throw httpError(401, "Wrong password");
      }
      const { password_hash, ...safeUser } = user;
      return { user: safeUser, token: signAccessToken(user), refresh_token: await issueRefresh(user.id) };
    },

    async register(input) {
      const { name, email, phone, password, role = "customer", loginMethod = "email", socialId, avatar } = input;
      if (!name?.trim()) throw httpError(400, "Name required");
      if (!email && !phone && !socialId) throw httpError(400, "Email, phone, or social ID required");
      if (email && await repo.findByEmail(email)) throw httpError(409, "Email already registered");
      if (phone && await repo.findByPhone(phone)) throw httpError(409, "Phone already registered");

      const id = uuidv4();
      const user = {
        id, name: name.trim(), email: email || null, phone: phone || null,
        password_hash: password ? await bcrypt.hash(password, 10) : null,
        role, avatar: avatar || null, login_method: loginMethod,
        social_id: socialId || null, referral_code: makeReferralCode(),
      };
      await repo.insertUser(user);
      if (role === "provider") {
        await repo.insertProviderProfile({
          id: uuidv4(), user_id: id,
          service_type_bn: input.service_type_bn || null, service_type_en: input.service_type_en || null,
          area_bn: input.area_bn || null, area_en: input.area_en || null, hourly_rate: input.hourly_rate || null,
        });
      }
      const profile = await repo.publicProfileById(id);
      return { user: profile, token: signAccessToken(profile), refresh_token: await issueRefresh(id) };
    },
  };
}

module.exports = { createAuthService, httpError };

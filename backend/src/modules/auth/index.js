// ── auth module — composition root ────────────────────────
// Wires repository → service → controller → router. This is the reference
// implementation of the controller/service/repository pattern (see
// src/modules/README.md). The legacy routes/auth.js remains the mounted
// implementation until each endpoint is migrated here.
const express = require("express");
const jwt = require("jsonwebtoken");
const repo = require("./auth.repository");
const refreshTokens = require("../../../utils/refreshTokens");
const pool = require("../../../db");
const { createAuthService } = require("./auth.service");
const { createAuthController } = require("./auth.controller");
const { registerRules, loginRules } = require("./auth.validation");

const signAccessToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_TTL || process.env.JWT_EXPIRES_IN || "7d",
  });
const issueRefresh = async (userId) => {
  try { return (await refreshTokens.issue(pool, userId)).token; } catch { return undefined; }
};

const service = createAuthService({ repo, signAccessToken, issueRefresh });
const controller = createAuthController(service);

function buildRouter() {
  const router = express.Router();
  router.post("/login", loginRules, controller.login);
  router.post("/register", registerRules, controller.register);
  return router;
}

module.exports = { service, controller, repo, buildRouter };

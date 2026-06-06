// ── auth.validation — request validation rules ────────────
const { validate, body } = require("../../../middleware/validate");

const registerRules = validate([
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 80 }).withMessage("Name too long"),
  body("email").optional({ checkFalsy: true }).isEmail().withMessage("Invalid email").normalizeEmail(),
  body("phone").optional({ checkFalsy: true }).matches(/^01[0-9]{9}$/).withMessage("Phone must be 11 digits starting with 01"),
  body("password").optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").optional().isIn(["customer", "provider"]).withMessage("Role must be customer or provider"),
]);

const loginRules = validate([
  body("identifier").trim().notEmpty().withMessage("Email or phone is required").isLength({ max: 100 }).withMessage("identifier too long"),
]);

module.exports = { registerRules, loginRules };

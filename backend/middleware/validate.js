// ─────────────────────────────────────────────────────────────
//  IMAP – express-validator helper
//  Usage in a route file:
//    const { validate, body, query } = require('../middleware/validate');
//    router.post('/register', validate([
//      body('name').trim().notEmpty().withMessage('Name required'),
//      body('phone').optional().isMobilePhone(),
//    ]), handler);
// ─────────────────────────────────────────────────────────────
const { validationResult, body, query, param } = require("express-validator");

/**
 * Run a set of express-validator checks and short-circuit with 422
 * if any fail. Pass the array of check() calls as the first argument.
 *
 * @param {import('express-validator').ValidationChain[]} checks
 * @returns {import('express').RequestHandler[]}
 */
const validate = (checks) => [
  ...checks,
  (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    return res.status(422).json({
      success: false,
      error: "Validation failed",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  },
];

module.exports = { validate, body, query, param };

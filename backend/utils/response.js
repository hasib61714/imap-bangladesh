// ─────────────────────────────────────────────────────────────
//  IMAP – Standardised API response helpers
//  Usage:
//    const { ok, fail, paginated } = require('../utils/response');
//    return ok(res, data);
//    return ok(res, data, 201);
//    return fail(res, "Not found", 404);
//    return paginated(res, rows, total, page, limit);
// ─────────────────────────────────────────────────────────────

/**
 * Success response
 * @param {import('express').Response} res
 * @param {*} data  - payload
 * @param {number} [status=200]
 */
const ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });

/**
 * Error response
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [status=400]
 * @param {*} [details]
 */
const fail = (res, message, status = 400, details) => {
  const body = { success: false, error: message };
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
};

/**
 * Paginated list response
 * @param {import('express').Response} res
 * @param {Array}  rows   - current page items
 * @param {number} total  - total matching count
 * @param {number} page   - current page (1-based)
 * @param {number} limit  - page size
 */
const paginated = (res, rows, total, page, limit) =>
  res.json({
    success: true,
    data: rows,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit),
    },
  });

module.exports = { ok, fail, paginated };

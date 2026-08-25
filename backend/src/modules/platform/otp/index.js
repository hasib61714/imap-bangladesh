/**
 * OTP — platform module public surface (I-05).
 *
 * Requiring this is how a route reaches the OTP store; nothing outside
 * `modules/platform/otp` may reach past it into the repository, and the
 * boundary checker enforces that.
 */
"use strict";

const domain = require("./domain/challenge");
const repository = require("./infrastructure/otpRepository");

module.exports = {
  ...domain,
  issue: repository.issue,
  verify: repository.verify,
  invalidateAll: repository.invalidateAll,
  secondsUntilResend: repository.secondsUntilResend,
  OtpStoreUnavailable: repository.OtpStoreUnavailable,
};

/**
 * Audit — platform component public surface
 *
 * The writer (I-03) and the actor description it takes. Everything else in
 * this directory is private: `writeAudit` computes its own diff and applies
 * its own denylist, and a caller that reached past this file could hand it
 * neither.
 */
"use strict";

const writer = require("./writeAudit");
const actor = require("./auditActor");

module.exports = {
  writeAudit: writer.writeAudit,
  writeAuditOutOfBand: writer.writeAuditOutOfBand,
  diffChangedFields: writer.diffChangedFields,
  FORBIDDEN_FIELDS: writer.FORBIDDEN_FIELDS,
  AuditError: writer.AuditError,
  auditActorFromRequest: actor.auditActorFromRequest,
  requestIp: actor.requestIp,
  requestUserAgent: actor.requestUserAgent,
};

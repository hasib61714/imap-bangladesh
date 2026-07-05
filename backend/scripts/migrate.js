#!/usr/bin/env node
/**
 * IMAP database migration CLI — thin wrapper over database/migrator.js
 * (the same engine the server runs at startup).
 *
 *   npm run migrate               apply all pending migrations
 *   npm run migrate:status        show applied / pending
 *   npm run migrate:down          roll back the most recent migration
 *   npm run migrate -- --dry-run  list what would run without changing anything
 */
require("dotenv").config();
const { runMigrations, status, rollback } = require("../database/migrator");

const args = process.argv.slice(2);
const cmd  = args.find((a) => !a.startsWith("-")) || "up";
const dry  = args.includes("--dry-run");
const log  = (...a) => console.log(...a);

(async () => {
  try {
    if (cmd === "status")     await status({ log });
    else if (cmd === "down")  await rollback({ log, dry });
    else                      await runMigrations({ log, dry });
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration error:", err.message, err.migration ? `(in ${err.migration})` : "");
    process.exit(1);
  }
})();

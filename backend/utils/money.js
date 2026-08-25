/**
 * Moved to src/shared/money.js in I-01.
 *
 * The rules are unchanged — this is a relocation into the layered structure
 * (docs/implementation/TARGET-REPOSITORY-STRUCTURE.md §5), not a rewrite. The
 * shim exists so the six route modules and the P0 money suite keep their
 * import path until each is migrated into its owning module.
 *
 * Delete this file when the last `require("../utils/money")` is gone.
 */
module.exports = require("../src/shared/money");

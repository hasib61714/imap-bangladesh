// services/api — canonical import path for the API client.
// Re-exports the existing client (src/api.js) so feature code can migrate to
// `import { bookings } from "@/services/api"` without breaking current imports.
export * from "../../api.js";
export { default } from "../../api.js";

// Route/render protection layer.
// Usable today as a render guard, and as route guards once a router is added
// (see app/ARCHITECTURE.md). UI is unchanged — these only gate children.
import { getToken } from "../services/api";

/** Render children only when an auth token is present, else `fallback`. */
export function RequireAuth({ children, fallback = null }) {
  return getToken() ? children : fallback;
}

/** Render children only when `user` has the required role, else `fallback`. */
export function RequireRole({ role, user, children, fallback = null }) {
  return user && user.role === role ? children : fallback;
}

export default RequireAuth;

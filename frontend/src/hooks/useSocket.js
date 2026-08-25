/**
 * useSocket — React access to the app's ONE socket connection.
 *
 * WHY THIS FILE NO LONGER OPENS A SOCKET
 * ──────────────────────────────────────
 * There were two socket modules, and each described itself as the
 * singleton: `src/socket.js` (used by ProviderPortal) and this hook (used by
 * App.jsx). Both called `io()` with their own copy of the URL expression, so
 * every session opened TWO websockets to the same server, authenticated
 * twice, joined rooms twice, and delivered every event twice to whichever
 * listeners happened to be on the other one.
 *
 * They also carried the same bug, twice:
 *
 *     import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000"
 *
 * `VITE_API_URL` is the RELATIVE "/api" in development, and "/api" with
 * "/api" removed is "", which is falsy — so both fell through to a hardcoded
 * port the dev backend does not use. The console filled with failed upgrade
 * attempts on every page load while realtime silently did not work.
 *
 * This is now a thin adapter over `src/socket.js`. One module owns the
 * connection, one place derives the URL, and fixing either can only be done
 * once.
 */
import { useEffect, useRef, useCallback } from "react";
import { connectSocket, getSocket } from "../socket";

export function useSocket(token) {
  const socketRef = useRef(null);

  useEffect(() => {
    // `connectSocket` reads the current token itself and reuses a live
    // connection, so this is idempotent across every component that calls it.
    socketRef.current = connectSocket();
    const s = getSocket();
    if (token && s && !s.connected) {
      s.auth = { token };
      s.connect();
    }
  }, [token]);

  const emit = useCallback((event, payload) => {
    const s = socketRef.current || getSocket();
    s?.emit(event, payload);
  }, []);

  const joinRoom       = useCallback((roomId) => emit("join_room", roomId), [emit]);
  const leaveRoom      = useCallback((roomId) => emit("leave_room", roomId), [emit]);
  const emitLocation   = useCallback((bookingId, lat, lng) => emit("location_update", { bookingId, lat, lng }), [emit]);
  const emitTyping     = useCallback((bookingId) => emit("typing", { bookingId }), [emit]);
  const emitStopTyping = useCallback((bookingId) => emit("stop_typing", { bookingId }), [emit]);

  /**
   * Subscribe to a socket event; returns an unsubscribe function.
   *
   * The handler is captured so the cleanup removes THIS listener rather than
   * whatever `socketRef.current` happens to be at unmount — which, after a
   * reconnect, is a different object.
   */
  const on = useCallback((event, handler) => {
    const s = socketRef.current || getSocket();
    if (!s) return () => {};
    s.on(event, handler);
    return () => s.off(event, handler);
  }, []);

  return { socketRef, joinRoom, leaveRoom, emitLocation, emitTyping, emitStopTyping, on };
}

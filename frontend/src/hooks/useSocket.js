/**
 * useSocket — singleton Socket.io connection
 * Shared across the whole app. Reconnects automatically.
 */
import { useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

let _socket = null;

function getSocket(token) {
  // Reuse the live socket ONLY if it was opened with the same token. Otherwise
  // (e.g. logged in after connecting anonymously, or switched account) the old
  // socket is still authenticated as the previous identity — tear it down and
  // reconnect with the new credentials.
  if (_socket && _socket.connected && _socket.auth?.token === (token || "")) return _socket;
  if (_socket) { _socket.disconnect(); _socket = null; }

  _socket = io(SOCKET_URL, {
    auth:         { token: token || "" },
    transports:   ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  if (import.meta.env.DEV) {
    _socket.on("connect",    () => console.log("🔌 Socket connected:", _socket.id));
    _socket.on("disconnect", () => console.log("🔌 Socket disconnected"));
    _socket.on("connect_error", e => console.warn("Socket error:", e.message));
  }

  return _socket;
}

export function useSocket(token) {
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = getSocket(token);
    // If the socket exists but carries a stale token, refresh auth + reconnect.
    if (_socket && _socket.auth?.token !== (token || "")) {
      _socket.auth = { token: token || "" };
      if (_socket.connected) _socket.disconnect();
      _socket.connect();
    } else if (_socket && !_socket.connected) {
      _socket.connect();
    }
  }, [token]);

  const joinRoom = useCallback((roomId) => {
    socketRef.current?.emit("join_room", roomId);
  }, []);

  const leaveRoom = useCallback((roomId) => {
    socketRef.current?.emit("leave_room", roomId);
  }, []);

  const emitLocation = useCallback((bookingId, lat, lng) => {
    socketRef.current?.emit("location_update", { bookingId, lat, lng });
  }, []);

  const emitTyping = useCallback((bookingId) => {
    socketRef.current?.emit("typing", { bookingId });
  }, []);

  const emitStopTyping = useCallback((bookingId) => {
    socketRef.current?.emit("stop_typing", { bookingId });
  }, []);

  /** Subscribe to a socket event; returns unsubscribe function */
  const on = useCallback((event, handler) => {
    if (!socketRef.current) return () => {};
    socketRef.current.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  return { socketRef, joinRoom, leaveRoom, emitLocation, emitTyping, emitStopTyping, on };
}

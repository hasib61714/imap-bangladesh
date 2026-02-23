/**
 * useSocket — singleton Socket.io connection
 * Shared across the whole app. Reconnects automatically.
 */
import { useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

let _socket = null;

function getSocket(token) {
  if (_socket && _socket.connected) return _socket;
  if (_socket) { _socket.disconnect(); _socket = null; }

  _socket = io(SOCKET_URL, {
    auth:         { token: token || "" },
    transports:   ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  _socket.on("connect",    () => console.log("🔌 Socket connected:", _socket.id));
  _socket.on("disconnect", () => console.log("🔌 Socket disconnected"));
  _socket.on("connect_error", e => console.warn("Socket error:", e.message));

  return _socket;
}

export function useSocket(token) {
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = getSocket(token);
    // If token changed, force reconnect with new auth
    if (token && _socket && !_socket.connected) {
      _socket.auth = { token };
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

  const emitTyping = useCallback((bookingId, name) => {
    socketRef.current?.emit("typing", { bookingId, name });
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

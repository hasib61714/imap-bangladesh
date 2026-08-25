// ─────────────────────────────────────────────────────────────
//  IMAP – Socket.io client service
//  Handles real-time chat, booking updates, live tracking
// ─────────────────────────────────────────────────────────────
import { io } from "socket.io-client";
import { getToken } from "./api";

/**
 * Where the socket server is.
 *
 * `VITE_API_URL` is an absolute URL in a deployed build and the RELATIVE
 * "/api" in development. Stripping "/api" from "/api" leaves "", which is
 * falsy, so the old expression fell through to the hardcoded
 * `http://localhost:5000` — a port the dev backend does not use, and one
 * that on this machine is held by an unrelated service. The result was a
 * websocket that failed, retried, and filled the console on every page load
 * while realtime silently did not work.
 *
 * Relative base → same origin, and the vite dev server proxies /socket.io
 * (with ws: true) to the local backend. Absolute base → strip the /api
 * suffix as before.
 */
const API_BASE = import.meta.env.VITE_API_URL || "";
const SOCKET_URL = /^https?:\/\//.test(API_BASE)
  ? API_BASE.replace(/\/api\/?$/, "")
  : (typeof window !== "undefined" ? window.location.origin : "");

let socket = null;

// ✅ Connect to socket server
export const connectSocket = () => {
  if (socket?.connected) return socket;

  const token = getToken();
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on("connect", () => {
    if (import.meta.env.DEV) console.log("🔌 Socket.io connected:", socket.id);
  });

  socket.on("disconnect", (reason) => {
    if (import.meta.env.DEV) console.log("🔌 Socket.io disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    if (import.meta.env.DEV) console.warn("⚠️ Socket.io error:", err.message);
  });

  // Realtime is an enhancement, not a requirement: chat and live booking
  // updates degrade to polling elsewhere in the app. After the configured
  // attempts are exhausted, stop — an endless reconnect loop buries every
  // other console message and keeps a dead socket alive in memory.
  socket.io.on("reconnect_failed", () => {
    if (import.meta.env.DEV) console.warn("⚠️ Socket.io gave up; realtime is off for this session.");
  });

  // Refresh JWT on every reconnect attempt so expiry never blocks reconnection
  socket.io.on("reconnect_attempt", () => {
    socket.auth = { token: getToken() };
  });

  return socket;
};

// ✅ Get existing socket
export const getSocket = () => socket;

// ✅ Disconnect
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// ✅ Join a booking chat room
export const joinRoom = (bookingId) => {
  if (socket) socket.emit("join_room", bookingId);
};

// ✅ Leave a booking chat room
export const leaveRoom = (bookingId) => {
  if (socket) socket.emit("leave_room", bookingId);
};

// ✅ Send typing indicator (name comes from server-side JWT, not sent by client)
export const sendTyping = (bookingId) => {
  if (socket) socket.emit("typing", { bookingId });
};

// ✅ Stop typing
export const stopTyping = (bookingId) => {
  if (socket) socket.emit("stop_typing", { bookingId });
};

// ✅ Listen for new messages in a room
export const onNewMessage = (callback) => {
  if (socket) socket.on("new_message", callback);
};

// ✅ Listen for booking updates
export const onBookingUpdated = (callback) => {
  if (socket) socket.on("booking_updated", callback);
};

// ✅ Listen for typing
export const onTyping = (callback) => {
  if (socket) socket.on("user_typing", callback);
};

// ✅ Listen for provider location
export const onProviderLocation = (callback) => {
  if (socket) socket.on("provider_location", callback);
};

// ✅ Listen for notifications
export const onNotification = (userId, callback) => {
  if (socket) socket.on(`user_${userId}`, callback);
};

// ✅ Remove all listeners for a room
export const offRoom = (bookingId) => {
  if (socket) {
    socket.off("new_message");
    socket.off("booking_updated");
    socket.off("user_typing");
    socket.off("user_stop_typing");
    socket.off("provider_location");
  }
};

export default { connectSocket, getSocket, disconnectSocket, joinRoom, leaveRoom, sendTyping, stopTyping, onNewMessage, onBookingUpdated, onTyping, onProviderLocation, onNotification, offRoom };

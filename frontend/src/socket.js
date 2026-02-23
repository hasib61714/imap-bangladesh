// ─────────────────────────────────────────────────────────────
//  IMAP – Socket.io client service
//  Handles real-time chat, booking updates, live tracking
// ─────────────────────────────────────────────────────────────
import { io } from "socket.io-client";
import { getToken } from "./api";

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

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
    console.log("🔌 Socket.io connected:", socket.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("🔌 Socket.io disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.warn("⚠️ Socket.io error:", err.message);
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

// ✅ Send typing indicator
export const sendTyping = (bookingId, name) => {
  if (socket) socket.emit("typing", { bookingId, name });
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

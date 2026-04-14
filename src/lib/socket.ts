import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket && currentToken === token && socket.connected) return socket;
  if (socket) { socket.removeAllListeners(); socket.disconnect(); }
  currentToken = token;
  socket = io({
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    transports: ['polling', 'websocket'],
    upgrade: true,
    forceNew: true,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.removeAllListeners(); socket.disconnect(); }
  socket = null;
  currentToken = null;
}

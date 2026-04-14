import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket && currentToken === token) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  if (socket) {
    socket.off();
    socket.disconnect();
  }

  currentToken = token;
  socket = io({
    auth: { token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    reconnectionAttempts: Infinity,
    transports: ['polling', 'websocket'],
    upgrade: true,
    timeout: 10000,
  });

  socket.io.on('reconnect', (attempt) => {
    console.log('[Socket] Reconnected after', attempt, 'attempts');
  });

  socket.io.on('reconnect_error', (err) => {
    console.log('[Socket] Reconnect error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.off();
    socket.disconnect();
  }
  socket = null;
  currentToken = null;
}

export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

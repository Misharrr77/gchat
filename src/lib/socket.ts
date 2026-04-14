import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket = io({ auth: { token }, reconnection: true, reconnectionDelay: 1000 });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

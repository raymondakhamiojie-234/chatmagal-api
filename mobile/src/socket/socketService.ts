import { io, Socket } from 'socket.io-client';
import { Message } from '../types';

let socket: Socket | null = null;

export const connectSocket = (
  serverUrl: string,
  options?: { workspaceId?: string; contactId?: string }
): Socket => {
  if (socket && socket.connected) {
    if (options?.workspaceId) socket.emit('joinWorkspace', options.workspaceId);
    if (options?.contactId) socket.emit('joinContact', options.contactId);
    return socket;
  }

  // Ensure clean URL without /api
  const cleanedUrl = serverUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');

  socket = io(cleanedUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('⚡ [Socket.io] Connected to server:', socket?.id);
    if (options?.workspaceId) {
      socket?.emit('joinWorkspace', options.workspaceId);
    }
    if (options?.contactId) {
      socket?.emit('joinContact', options.contactId);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('⚠️ [Socket.io] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('❌ [Socket.io] Connection error:', err.message);
  });

  return socket;
};

export const subscribeToMessages = (callback: (msg: Message) => void) => {
  if (!socket) return () => {};
  socket.on('newMessage', callback);
  return () => {
    socket?.off('newMessage', callback);
  };
};

export const subscribeToTyping = (callback: (data: { contactId: string; isTyping: boolean }) => void) => {
  if (!socket) return () => {};
  socket.on('typingStatus', callback);
  return () => {
    socket?.off('typingStatus', callback);
  };
};

export const emitTypingStatus = (workspaceId: string, contactId: string, isTyping: boolean) => {
  if (socket && socket.connected) {
    socket.emit('typing', { workspaceId, contactId, isTyping });
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisClient } from './redis';
import { Server as HttpServer } from 'http';

let io: SocketIOServer;

export const initSocket = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const subClient = redisClient.duplicate();
  io.adapter(createAdapter(redisClient, subClient));

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('joinWorkspace', (workspaceId: string) => {
      socket.join(workspaceId);
      console.log(`Socket ${socket.id} joined workspace ${workspaceId}`);
    });

    socket.on('typing', ({ workspaceId, contactId, isTyping }) => {
      console.log(`⚡ Socket typing status broadcast: workspace=${workspaceId}, contact=${contactId}, isTyping=${isTyping}`);
      socket.to(workspaceId).emit('typingStatus', { contactId, isTyping });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIo = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.io is not initialized!');
  }
  return io;
};

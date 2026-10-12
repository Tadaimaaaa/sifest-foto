import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { SessionManager } from './src/lib/session-manager';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = 3000;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const broadcast = (event: string, payload?: any) => {
    io.to('kiosk').emit(event, payload);
  };

  const sessionManager = new SessionManager(broadcast);

  // Expose session manager and socket server globally for API routes to access
  (global as any).sessionManager = sessionManager;
  (global as any).io = io;
  (global as any).broadcast = broadcast;

  io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);
    socket.join('kiosk'); // All kiosks join this room

    // Initialize with current session state
    const activeSession = sessionManager.getActiveSession();
    if (activeSession) {
      socket.emit('session:updated', { session: activeSession });
    }

    socket.on('session:start', async (data) => {
      try {
        await sessionManager.startSession(data.templateId || 'classic');
      } catch (err: any) {
        socket.emit('session:error', { error: err.message });
      }
    });

    socket.on('session:abort', () => {
      sessionManager.abortSession();
    });

    socket.on('session:reset', () => {
      sessionManager.resetSession();
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Client disconnected:', socket.id);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});

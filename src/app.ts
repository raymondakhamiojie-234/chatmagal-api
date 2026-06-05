import express from 'express';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { initSocket } from '../config/socket';

// Routes
import webhookRoutes from './routes/webhook';
import apiRoutes from './routes/api';
import onboardRoutes from './routes/onboard';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

// Middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Hub-Signature-256');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Serve frontend console, uploader and simulator statically to prevent browser CORS/file origin restrictions
app.use(express.static(process.cwd()));

// Mount Routes
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);
app.use('/api/whatsapp/onboard', onboardRoutes);

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

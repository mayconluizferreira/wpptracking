import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './routes/auth';
import { leadsRouter } from './routes/leads';
import { settingsRouter } from './routes/settings';
import { statsRouter } from './routes/stats';
import { logsRouter } from './routes/logs';
import { webhookRouter } from './routes/webhook';
import { connectionsRouter } from './routes/connections';
import { triggerPhrasesRouter } from './routes/trigger-phrases';
import { errorMiddleware } from './middleware/error';
import { startCapiRetryScheduler } from './services/capi-scheduler';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  })
);

// Raw body parser ONLY for WhatsApp webhook (needed for HMAC signature validation)
// Matches both /webhook/whatsapp and /webhook/whatsapp/:connectionId
// 15mb limit: WhatsApp Cloud API media messages can carry base64-ish payload sizes.
app.use(/^\/webhook\/whatsapp(\/\d+)?$/, express.raw({ type: 'application/json', limit: '15mb' }));

// JSON parser for all other routes.
// 15mb limit: the Evolution webhook can carry base64-encoded image data
// (with "Webhook Base64" enabled) well over Express's 100kb default.
app.use(express.json({ limit: '15mb' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/trigger-phrases', triggerPhrasesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/logs', logsRouter);
app.use('/webhook', webhookRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// In production: serve the Vite-built frontend from Express
// __dirname = /app/backend/dist → frontend/dist is at ../../frontend/dist
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use(errorMiddleware);

const server = app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
  startCapiRetryScheduler();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Porta ${PORT} já está em uso. Encerre o processo anterior e tente novamente.`);
    process.exit(1);
  }
  throw err;
});

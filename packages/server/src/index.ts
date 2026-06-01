import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { filesRouter } from './routes/files';
import { agentRouter } from './routes/agent';
import { mcpRouter } from './routes/mcp';
import { createConfigRouter } from './routes/config';

export interface ServerConfig {
  port?: number;
  host?: string;
  corsOrigin?: string;
  serveStatic?: string;
  configDir?: string;
}

export function createApp(config: ServerConfig = {}) {
  const app = express();
  const port = config.port ?? 20385;
  const host = config.host ?? '0.0.0.0';
  const configDir = config.configDir || './config';

  app.use(cors({ origin: config.corsOrigin ?? '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
  app.use(express.json({ limit: '50mb' }));

  app.use('/api/files', filesRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/mcp', mcpRouter);
  app.use('/api/config', createConfigRouter(configDir));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  if (config.serveStatic) {
    app.use(express.static(config.serveStatic));
    app.get('*', (_req, res) => {
      res.sendFile('index.html', { root: config.serveStatic });
    });
  }

  return { app, port, host };
}

export function startServer(config: ServerConfig = {}) {
  const { app, port, host } = createApp(config);
  const server = createServer(app);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try setting SERVER_PORT env or changing app-config.json.`);
    }
  });

  server.listen(port, host, () => {
    console.log(`VibeEditor server running at http://${host}:${port}`);
  });

  return server;
}

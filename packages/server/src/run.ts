import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { startServer } from './index';

let configPort = 20385;
let configDir = './config';
try {
  const configPath = join(__dirname, '../../app-config.json');
  if (existsSync(configPath)) {
    const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (cfg.serverPort) configPort = cfg.serverPort;
    if (cfg.configDir) configDir = resolve(cfg.configDir);
  }
} catch { /* ignore missing config */ }

startServer({
  serveStatic: process.env.SERVE_STATIC,
  port: Number(process.env.PORT) || Number(process.env.SERVER_PORT) || configPort,
  configDir: configDir,
});

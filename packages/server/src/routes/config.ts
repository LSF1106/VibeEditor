import { Router, Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

function sanitizeFilename(name: string): string {
  const base = path.basename(name, '.json');
  return `${base}.json`;
}

export function createConfigRouter(configDir: string) {
  const router = Router();

  const resolvedDir = path.resolve(configDir);

  router.get('/:filename', async (req: Request, res: Response) => {
    const filename = sanitizeFilename(req.params.filename);
    const filePath = path.join(resolvedDir, filename);

    if (!filePath.startsWith(resolvedDir)) {
      res.status(403).json({ error: 'Invalid config path' });
      return;
    }

    try {
      if (!existsSync(filePath)) {
        res.status(404).json({ error: 'Config file not found' });
        return;
      }
      const content = await fs.readFile(filePath, 'utf-8');
      res.json(JSON.parse(content));
    } catch (err) {
      res.status(500).json({ error: 'Failed to read config file' });
    }
  });

  router.put('/:filename', async (req: Request, res: Response) => {
    const filename = sanitizeFilename(req.params.filename);
    const filePath = path.join(resolvedDir, filename);

    if (!filePath.startsWith(resolvedDir)) {
      res.status(403).json({ error: 'Invalid config path' });
      return;
    }

    try {
      await fs.mkdir(resolvedDir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(req.body, null, 2), 'utf-8');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to write config file' });
    }
  });

  return router;
}

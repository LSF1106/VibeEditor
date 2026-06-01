import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/main-server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/main.js',
  sourcemap: true,
  external: [
    'electron',
    'electron/*',
    'express',
    'cors',
    'openai',
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/*',
  ],
});

console.log('[build:electron] main process bundle complete → dist/main.js');

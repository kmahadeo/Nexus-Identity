import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Vite dev plugin: proxies POST /duo-token-proxy → Duo token endpoint.
 * Avoids CORS — the browser calls same-origin /duo-token-proxy and this
 * middleware forwards it server-side to https://{X-Duo-Hostname}/oauth/v1/token.
 */
function duoCorsProxy(): Plugin {
  return {
    name: 'duo-cors-proxy',
    configureServer(server) {
      server.middlewares.use(
        '/duo-token-proxy',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          const hostname = req.headers['x-duo-hostname'] as string | undefined;
          if (!hostname) { res.statusCode = 400; res.end('Missing X-Duo-Hostname header'); return; }

          const chunks: Buffer[] = [];
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', async () => {
            try {
              const upstream = await fetch(`https://${hostname}/oauth/v1/token`, {
                method: 'POST',
                headers: {
                  'Authorization': req.headers['authorization'] as string,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: Buffer.concat(chunks).toString(),
              });
              const text = await upstream.text();
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = upstream.status;
              res.end(text);
            } catch (err) {
              res.statusCode = 502;
              res.end(JSON.stringify({ error: 'proxy_error', error_description: String(err) }));
            }
          });
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), duoCorsProxy()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      '@icp-sdk/core/principal': fileURLToPath(new URL('./icp-principal-stub.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});

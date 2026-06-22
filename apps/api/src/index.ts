import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { readApiRuntimeConfig } from './config/runtime.js';
import { registerGracefulShutdown } from './lib/serverLifecycle.js';

export async function startServer(
  env: NodeJS.ProcessEnv = process.env
): Promise<Server> {
  const config = readApiRuntimeConfig(env);
  const app = createApp(config);

  return await new Promise<Server>((resolve, reject) => {
    const server = app.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`BarberApp API running on port ${config.port}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  startServer()
    .then((server) => {
      registerGracefulShutdown(server, {
        onDisconnect: async () => {
          const { prisma } = await import('./lib/prisma.js');
          await prisma.$disconnect();
        },
      });
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown startup error';

      // eslint-disable-next-line no-console
      console.error(`API startup failed: ${message}`);
      process.exit(1);
    });
}

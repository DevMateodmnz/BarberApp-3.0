import type { Server } from 'node:http';
import { EventEmitter } from 'node:events';

export interface ShutdownLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface ShutdownProcess extends EventEmitter {
  exit(code?: number): never;
}

export interface GracefulShutdownOptions {
  forceExitTimeoutMs?: number;
  logger?: ShutdownLogger;
  onDisconnect?: () => Promise<void>;
  processRef?: ShutdownProcess;
  signals?: readonly NodeJS.Signals[];
}

const DEFAULT_SIGNALS: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

function createConsoleLogger(): ShutdownLogger {
  return {
    info(message: string) {
      // eslint-disable-next-line no-console
      console.log(message);
    },
    error(message: string, error?: unknown) {
      // eslint-disable-next-line no-console
      console.error(message, error ?? '');
    },
  };
}

export function registerGracefulShutdown(
  server: Server,
  options: GracefulShutdownOptions = {}
): () => void {
  const processRef = options.processRef ?? process;
  const logger = options.logger ?? createConsoleLogger();
  const timeoutMs = options.forceExitTimeoutMs ?? 10_000;
  const signals = options.signals ?? DEFAULT_SIGNALS;
  let shuttingDown = false;

  const cleanupFns = signals.map((signal) => {
    const handler = () => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      logger.info(`Received ${signal}; shutting down BarberApp API`);

      const forceExitTimer = setTimeout(() => {
        logger.error(
          `Graceful shutdown timed out after ${timeoutMs}ms; forcing exit`
        );
        server.closeAllConnections?.();
        processRef.exit(1);
      }, timeoutMs);
      forceExitTimer.unref?.();

      server.close((error?: Error) => {
        void (async () => {
          try {
            if (error) {
              logger.error('HTTP server failed to close cleanly', error);
              clearTimeout(forceExitTimer);
              return processRef.exit(1);
            }

            server.closeIdleConnections?.();

            if (options.onDisconnect) {
              await options.onDisconnect();
            }

            clearTimeout(forceExitTimer);
            logger.info('BarberApp API shutdown complete');
            return processRef.exit(0);
          } catch (disconnectError) {
            clearTimeout(forceExitTimer);
            logger.error(
              'Shutdown failed while disconnecting dependencies',
              disconnectError
            );
            return processRef.exit(1);
          }
        })();
      });
    };

    processRef.on(signal, handler);

    return () => {
      processRef.off(signal, handler);
    };
  });

  return () => {
    for (const cleanup of cleanupFns) {
      cleanup();
    }
  };
}

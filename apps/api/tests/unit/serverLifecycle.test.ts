import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGracefulShutdown } from '../../src/lib/serverLifecycle.js';

class FakeProcess extends EventEmitter {
  public readonly exit = vi.fn((_code?: number) => undefined as never);
}

function createServerDouble(
  closeImpl?: Parameters<Server['close']>[0]
): Server {
  const close = vi.fn((callback?: (error?: Error) => void) => {
    if (callback && closeImpl) {
      closeImpl(callback);
    } else if (callback) {
      callback();
    }
    return server;
  });

  const server = {
    close,
    closeIdleConnections: vi.fn(),
    closeAllConnections: vi.fn(),
  } as unknown as Server;

  return server;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('registerGracefulShutdown', () => {
  it('closes the server, disconnects Prisma, and exits cleanly on SIGTERM', async () => {
    const processRef = new FakeProcess();
    const onDisconnect = vi.fn(async () => {});
    const server = createServerDouble((callback) => callback());

    registerGracefulShutdown(server, {
      onDisconnect,
      processRef,
      signals: ['SIGTERM'],
    });

    processRef.emit('SIGTERM');

    expect((server.close as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5 && processRef.exit.mock.calls.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(processRef.exit).toHaveBeenCalledWith(0);
  });

  it('forces exit if shutdown exceeds the timeout', () => {
    vi.useFakeTimers();
    const processRef = new FakeProcess();
    const server = createServerDouble(() => {
      // Intentionally never invoke the callback
    });

    registerGracefulShutdown(server, {
      forceExitTimeoutMs: 250,
      processRef,
      signals: ['SIGTERM'],
    });

    processRef.emit('SIGTERM');

    vi.advanceTimersByTime(250);

    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(processRef.exit).toHaveBeenCalledWith(1);
  });
});

import type { Context } from 'hono';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Authentication modes exercised by the development-server process tests. */
export type DevServerAuthConfig =
  | { type: 'bearer'; token: string }
  | { type: 'generated' }
  | { type: 'none' };

const serverPackageDirectory = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Starts the development server with an isolated authentication environment.
 *
 * Removing both authentication variables before applying the requested mode keeps
 * developer or CI environment values from changing the behavior under test.
 * @param authConfig - Authentication mode for the development server
 * @returns Spawned development server process
 */
export const spawnDevServer = (authConfig: DevServerAuthConfig): ChildProcess => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: '0',
  };
  delete env.MCP_FUNNEL_AUTH_TOKEN;
  delete env.DISABLE_INBOUND_AUTH;

  if (authConfig.type === 'bearer') {
    env.MCP_FUNNEL_AUTH_TOKEN = authConfig.token;
  } else if (authConfig.type === 'none') {
    env.DISABLE_INBOUND_AUTH = 'true';
  }

  return spawn('tsx', ['src/dev.ts'], {
    cwd: serverPackageDirectory,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
};

/**
 * Helper function to create a mock Hono context for tests
 * Only provides the minimal req.header() method that validators use
 * @param headerFn - Function to simulate header retrieval behavior
 * @returns Minimal mock Hono context with request header functionality
 */
export const createMockContext = (
  headerFn: (name?: string) => string | undefined | Record<string, string>,
): Context => {
  return {
    req: {
      header: headerFn,
    },
  } as Context;
};

/**
 * Helper type for testing invalid configurations
 * This allows us to pass intentionally malformed configs to validation functions
 */
export type InvalidAuthConfig = { type?: string; tokens?: string[] };

/**
 * Helper to wait for development server to be ready
 * @param child - The spawned child process running the server
 * @param timeout - Maximum time in milliseconds to wait (default: 10000)
 * @returns Promise resolving to the port number the server is running on
 */
export const waitForServerReady = (child: ChildProcess, timeout = 10000): Promise<number> => {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, timeout);

    const onData = (data: Buffer) => {
      output += data.toString();
      // Look for server ready message with port
      const match = output.match(/Web UI server running at.*:(\d+)/);
      if (match) {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        child.stderr?.off('data', onData);
        resolve(parseInt(match[1], 10));
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });
};

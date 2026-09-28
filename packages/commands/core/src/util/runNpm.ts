import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

interface NpmResult {
  stdout: string;
  stderr: string;
}

interface NpmInvocation {
  readonly executable: string;
  readonly args: string[];
}

const WINDOWS_NPM_EXECUTABLE_NAMES = ['npm.com', 'npm.exe', 'npm.bat', 'npm.cmd'] as const;

function resolveNodeExecutable(npmDirectory?: string): string {
  if (npmDirectory) {
    const adjacentNode = win32.join(npmDirectory, 'node.exe');
    if (existsSync(adjacentNode)) return adjacentNode;
  }

  const configuredNode = process.env.npm_node_execpath;
  if (configuredNode && win32.isAbsolute(configuredNode) && existsSync(configuredNode)) {
    return configuredNode;
  }

  return process.execPath;
}

function createWindowsNpmInvocation(
  npmExecutable: string,
  args: string[],
): NpmInvocation | undefined {
  const executableName = win32.basename(npmExecutable).toLowerCase();

  if (executableName === 'npm-cli.js') {
    return {
      executable: resolveNodeExecutable(),
      args: [npmExecutable, ...args],
    };
  }

  if (executableName === 'npm.exe' || executableName === 'npm.com') {
    return { executable: npmExecutable, args };
  }

  if (executableName !== 'npm.cmd' && executableName !== 'npm.bat') return undefined;

  // execFile cannot launch Windows command scripts without a shell. Standard npm wrappers locate
  // this CLI relative to themselves, so invoke that JavaScript entry point directly instead.
  const npmDirectory = win32.dirname(npmExecutable);
  const npmCli = win32.join(npmDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!existsSync(npmCli)) return undefined;

  return {
    executable: resolveNodeExecutable(npmDirectory),
    args: [npmCli, ...args],
  };
}

function resolveWindowsNpmInvocation(args: string[]): NpmInvocation {
  const configuredNpm = process.env.npm_execpath;
  if (configuredNpm && win32.isAbsolute(configuredNpm) && existsSync(configuredNpm)) {
    const configuredInvocation = createWindowsNpmInvocation(configuredNpm, args);
    if (configuredInvocation) return configuredInvocation;
  }

  const pathDirectories = process.env.PATH?.split(win32.delimiter) ?? [];
  for (const pathDirectory of pathDirectories) {
    const trimmedDirectory = pathDirectory.trim();
    const directory =
      trimmedDirectory.startsWith('"') && trimmedDirectory.endsWith('"')
        ? trimmedDirectory.slice(1, -1)
        : trimmedDirectory;
    if (!directory || !win32.isAbsolute(directory)) continue;

    for (const executableName of WINDOWS_NPM_EXECUTABLE_NAMES) {
      const npmExecutable = win32.join(directory, executableName);
      if (!existsSync(npmExecutable)) continue;

      const invocation = createWindowsNpmInvocation(npmExecutable, args);
      if (invocation) return invocation;
    }
  }

  throw new Error('Unable to locate npm from npm_execpath or PATH');
}

function resolveNpmInvocation(args: string[]): NpmInvocation {
  return process.platform === 'win32'
    ? resolveWindowsNpmInvocation(args)
    : { executable: 'npm', args };
}

export function runNpm(args: string[], cwd: string): Promise<NpmResult> {
  return new Promise((resolve, reject) => {
    let invocation: NpmInvocation;
    try {
      invocation = resolveNpmInvocation(args);
    } catch (error) {
      reject(error);
      return;
    }

    execFile(
      invocation.executable,
      invocation.args,
      { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
      },
    );
  });
}

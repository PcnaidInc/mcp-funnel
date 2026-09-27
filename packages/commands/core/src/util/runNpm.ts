import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface NpmResult {
  stdout: string;
  stderr: string;
}

export function runNpm(args: string[], cwd: string): Promise<NpmResult> {
  const windowsNpmCli = join(
    dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  if (process.platform === 'win32' && !existsSync(windowsNpmCli)) {
    return Promise.reject(
      new Error('Unable to locate npm-cli.js beside the Node.js executable'),
    );
  }
  const executable = process.platform === 'win32' ? process.execPath : 'npm';
  const executableArgs =
    process.platform === 'win32' ? [windowsNpmCli, ...args] : args;
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      executableArgs,
      { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
      },
    );
  });
}

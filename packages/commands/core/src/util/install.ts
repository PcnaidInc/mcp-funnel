import type { CommandInstallerContext, InstalledCommand, InstallOptions } from '../types/index.js';
import { initialize } from './initialize.js';
import { readManifest } from '@mcp-funnel/commands-core';
import { findMatchingCommand } from './findMatchingCommand.js';
import { readPackagesPackageJson } from './readPackagesPackageJson.js';
import { resolveInstalledPackageName } from './resolveInstalledPackageName.js';
import { getPackagePath } from './getPackagePath.js';
import { loadCommand } from './loadCommand.js';
import { join } from 'path';
import { promises as fs } from 'fs';
import { writeManifest } from './writeManifest.js';
import { isExactNpmVersion, isNpmPackageName, parseNpmPackageSpec } from './npmPackageSpec.js';
import { runNpm } from './runNpm.js';

/**
 * Installs a command package from npm registry to the isolated packages directory.
 *
 * This function orchestrates the complete installation workflow:
 * 1. Checks if the package is already installed (throws unless force option is set)
 * 2. Executes npm install to download the package
 * 3. Resolves the actual installed package name from package.json dependencies
 * 4. Validates the package exports implement ICommand interface
 * 5. Updates the manifest with installation metadata
 * 6. Rolls back on validation failure
 *
 * The function accepts npm registry package names, optionally with an exact
 * semantic version. Aliases, URLs, local paths, tags and ranges are rejected.
 * @param context - Installer context containing directory paths and manifest location
 * @param packageSpec - npm registry package name, optionally with an exact version
 * @param options - Installation options for force reinstall and version pinning
 * @returns Metadata about the installed command including name, version, and installation timestamp
 * @throws When package is already installed and force option is not set
 * @throws When npm install fails (network error, package not found, invalid version)
 * @throws When installed package does not export a valid ICommand interface
 * @example
 * ```typescript
 * // Install latest version of a scoped package
 * const cmd = await install(context, '@mcp-funnel/commands-js-debugger');
 * console.log(`Installed ${cmd.name} v${cmd.version}`);
 *
 * // Install specific version
 * const cmd = await install(context, 'weather-tool', { version: '2.1.0' });
 *
 * // Force reinstall existing package
 * const cmd = await install(context, '@mcp-funnel/commands-js-debugger', { force: true });
 * ```
 * @see file:./resolveInstalledPackageName.ts:24 - Package name resolution logic
 * @see file:./loadCommand.ts:28 - Command validation and loading
 * @see file:../installer.ts:90 - Public API wrapper
 * @internal
 */
export async function install(
  context: CommandInstallerContext,
  packageSpec: string,
  options: InstallOptions = {},
): Promise<InstalledCommand> {
  await initialize(context);
  const parsedSpec = parseNpmPackageSpec(packageSpec);
  if (options.version !== undefined && !isExactNpmVersion(options.version)) {
    throw new Error('Version must be an exact semantic version');
  }
  if (options.version !== undefined && parsedSpec.version !== undefined) {
    throw new Error('Specify a version either in package or version, not both');
  }

  // Check if already installed
  const manifest = await readManifest(context.manifestPath);
  const existing = findMatchingCommand(manifest, parsedSpec.name);

  if (existing && !options.force) {
    throw new Error(
      `Command package '${existing.package}' is already installed. Use force option to reinstall.`,
    );
  }

  const packagesJsonBefore = await readPackagesPackageJson(context.packagesDir);
  const dependencyGuess = existing?.package || parsedSpec.name;
  if (!isNpmPackageName(dependencyGuess)) throw new Error('Invalid package name in command manifest');

  // Determine the install spec
  const requestedVersion = options.version ?? parsedSpec.version;
  const installSpec = requestedVersion
    ? `${dependencyGuess}@${requestedVersion}`
    : dependencyGuess;

  console.info(`Installing command package: ${installSpec}`);

  try {
    // Install the package using npm
    const { stderr } = await runNpm(['install', '--save', '--', installSpec], context.packagesDir);

    if (stderr && !stderr.includes('npm WARN')) {
      console.warn('Installation warnings:', stderr);
    }

    const packagesJsonAfter = await readPackagesPackageJson(context.packagesDir);
    const resolvedPackageName = resolveInstalledPackageName({
      installSpec,
      packageSpec,
      dependencyGuess,
      manifest,
      packagesJsonBefore,
      packagesJsonAfter,
    });
    if (!isNpmPackageName(resolvedPackageName)) {
      throw new Error('Installed package resolved to an invalid npm package name');
    }

    // Load the installed command to get metadata
    const commandPath = getPackagePath(context.packagesDir, resolvedPackageName);
    const command = await loadCommand(commandPath);

    if (!command) {
      // Rollback installation
      await runNpm(['uninstall', '--', resolvedPackageName], context.packagesDir);
      throw new Error(
        `Package '${resolvedPackageName}' does not export a valid MCP Funnel command`,
      );
    }

    // Get package version
    const pkgJsonPath = join(commandPath, 'package.json');
    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));

    // Create installed command record
    const installedCommand: InstalledCommand = {
      name: command.name,
      package: resolvedPackageName,
      version: pkgJson.version,
      description: command.description,
      installedAt: new Date().toISOString(),
    };

    // Update manifest
    if (existing) {
      const index = manifest.commands.findIndex((cmd) => cmd.package === existing.package);
      manifest.commands[index] = installedCommand;
    } else {
      manifest.commands.push(installedCommand);
    }
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(context.manifestPath, manifest);

    console.info(
      `Successfully installed command: ${command.name} (${resolvedPackageName}@${pkgJson.version})`,
    );
    return installedCommand;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to install command package: ${errorMessage}`);
  }
}

import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { CoreToolContext } from '../core-tool.interface.js';
import {
  CommandInstaller,
  readManifest,
  type InstalledCommand,
  type NpmPackageSpec,
} from '@mcp-funnel/commands-core';
import { validatePackageParam, validateVersionParam } from './utils/validation.js';
import {
  formatAlreadyInstalledResponse,
  formatInstallResponse,
  formatUninstallResponse,
  formatUpdateResponse,
  formatErrorResponse,
  formatUnknownActionResponse,
} from './utils/response-formatter.js';
import { hotReloadCommand, getExistingTools } from './utils/hot-reload.js';

export class ManageCommands extends BaseCoreTool {
  public readonly name = 'manage_commands';
  public readonly tool: Tool = {
    name: this.name,
    description: 'Manage MCP Funnel commands - install, uninstall, or update npm packages',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['install', 'uninstall', 'update'],
          description: 'Action to perform',
        },
        package: {
          type: 'string',
          maxLength: 343,
          description: 'NPM registry package name with optional exact version (e.g., @org/command, package@1.0.0)',
        },
        version: {
          type: 'string',
          maxLength: 128,
          description: 'Specific version to install (optional, only for install action)',
        },
        force: {
          type: 'boolean',
          description: 'Force reinstall even if already installed (only for install action)',
          default: false,
        },
        removeData: {
          type: 'boolean',
          description:
            'Also remove any data associated with the command (only for uninstall action)',
          default: false,
        },
      },
      required: ['action', 'package'],
    },
  };

  private installer: CommandInstaller;

  public constructor(installer?: CommandInstaller) {
    super();
    this.installer = installer || new CommandInstaller();
  }

  public async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    const action = args.action as string;

    // Validate required parameters
    const packageValidation = validatePackageParam(args.package);
    if (!packageValidation.valid) {
      return packageValidation.error;
    }
    const versionValidation = validateVersionParam(args.version);
    if (!versionValidation.valid) return versionValidation.error;

    const packageSpec = packageValidation.value;

    try {
      switch (action) {
        case 'install':
          return await this.handleInstall(args, packageSpec, versionValidation.value, context);

        case 'uninstall':
          return await this.handleUninstall(args, packageSpec.name);

        case 'update':
          return await this.handleUpdate(packageSpec.name, context);

        default:
          return formatUnknownActionResponse(action);
      }
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  private async handleInstall(
    args: Record<string, unknown>,
    packageSpec: NpmPackageSpec,
    version: string | undefined,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    const force = args.force as boolean | undefined;

    let installed;
    try {
      installed = await this.installer.install(packageSpec.installSpec, {
        force,
        version,
      });
    } catch (error) {
      // Check if it's an "already installed" error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('already installed')) {
        return await this.handleAlreadyInstalled(packageSpec.name, context);
      }
      throw error;
    }

    // Try to hot-reload the command
    const reloadResult = await hotReloadCommand(
      this.installer,
      installed.package,
      installed.name,
      context,
    );

    return formatInstallResponse(
      installed,
      reloadResult.tools,
      reloadResult.hotReloaded,
      reloadResult.hotReloadError,
    );
  }

  private async handleAlreadyInstalled(
    packageName: string,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    // Get existing command info
    const manifest = await readManifest(this.installer.getManifestPath());
    const existing = manifest.commands.find(
      (cmd: InstalledCommand) => cmd.package === packageName || cmd.name === packageName,
    );

    if (!existing) {
      throw new Error('Command not found in manifest');
    }

    // Try to discover existing tools
    let existingTools = getExistingTools(existing.name, context);

    // If no tools found, attempt to hot-reload the already installed command
    if (existingTools.length === 0) {
      const reloadResult = await hotReloadCommand(
        this.installer,
        existing.package,
        existing.name,
        context,
      );
      existingTools = reloadResult.tools;
    }

    return formatAlreadyInstalledResponse(existing, existingTools);
  }

  private async handleUninstall(
    args: Record<string, unknown>,
    packageName: string,
  ): Promise<CallToolResult> {
    const removeData = args.removeData as boolean | undefined;

    await this.installer.uninstall(packageName, { removeData });

    return formatUninstallResponse(packageName);
  }

  private async handleUpdate(
    packageName: string,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    const updated = await this.installer.update(packageName);

    // Try to hot-reload the updated command
    const reloadResult = await hotReloadCommand(
      this.installer,
      updated.package,
      updated.name,
      context,
    );

    return formatUpdateResponse(updated, reloadResult.hotReloaded, reloadResult.hotReloadError);
  }
}

/**
 * Validation utilities for manage-commands tool.
 *
 * Provides parameter validation functions for command management operations.
 * @internal
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isExactNpmVersion, parseNpmPackageSpec } from '@mcp-funnel/commands-core';

/**
 * Result of a validation operation.
 * @public
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Optional error result if validation failed */
  error?: CallToolResult;
}

/**
 * Validates that the package parameter is provided.
 * @param packageSpec - Package specification to validate
 * @returns Validation result with error if package is missing
 * @public
 */
export function validatePackageParam(packageSpec: unknown): ValidationResult {
  try {
    parseNpmPackageSpec(packageSpec);
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Package must be an unaliased npm registry name with an optional exact version',
            }),
          },
        ],
      },
    };
  }
}

export function validateVersionParam(version: unknown): ValidationResult {
  if (version === undefined || isExactNpmVersion(version)) return { valid: true };
  return {
    valid: false,
    error: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Version must be an exact semantic version' }),
        },
      ],
    },
  };
}

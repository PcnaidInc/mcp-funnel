/**
 * Validation utilities for manage-commands tool.
 *
 * Provides parameter validation functions for command management operations.
 * @internal
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  isExactNpmVersion,
  parseNpmPackageSpec,
  type NpmPackageSpec,
} from '@mcp-funnel/commands-core';

/**
 * Failed validation result with a response ready to return from an MCP tool.
 * @internal
 */
type ValidationFailure = {
  readonly valid: false;
  readonly error: CallToolResult;
};

/**
 * Result of validating and normalizing an input value.
 * @typeParam T - Normalized value produced by successful validation
 * @public
 */
export type ValidationResult<T> =
  | { readonly valid: true; readonly value: T }
  | ValidationFailure;

function validationFailure(message: string): ValidationFailure {
  return {
    valid: false,
    error: {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    },
  };
}

/**
 * Validates that the package parameter is an unaliased npm registry name with
 * an optional exact semantic version.
 * @param packageSpec - Package specification to validate
 * @returns Validation result with an error if the package is missing or invalid
 * @public
 */
export function validatePackageParam(packageSpec: unknown): ValidationResult<NpmPackageSpec> {
  try {
    return { valid: true, value: parseNpmPackageSpec(packageSpec) };
  } catch {
    return validationFailure(
      'Package must be an unaliased npm registry name with an optional exact version',
    );
  }
}

/**
 * Validates and normalizes the optional standalone install version.
 * JSON null and an omitted value both normalize to undefined.
 * @param version - Optional exact semantic version supplied by the tool caller
 * @returns The normalized version or an MCP validation response
 * @public
 */
export function validateVersionParam(version: unknown): ValidationResult<string | undefined> {
  if (version === undefined || version === null) return { valid: true, value: undefined };
  if (isExactNpmVersion(version)) return { valid: true, value: version };
  return validationFailure('Version must be an exact semantic version');
}

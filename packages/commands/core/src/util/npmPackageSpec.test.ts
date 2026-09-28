import { describe, expect, it } from 'vitest';
import {
  isExactNpmVersion,
  isNpmPackageName,
  parseNpmPackageSpec,
} from './npmPackageSpec.js';

describe('npm package spec validation', () => {
  it('accepts registry package names and exact versions', () => {
    expect(parseNpmPackageSpec('@mcp-funnel/command-vitest@1.2.3')).toEqual({
      name: '@mcp-funnel/command-vitest',
      version: '1.2.3',
      installSpec: '@mcp-funnel/command-vitest@1.2.3',
    });
    expect(isNpmPackageName('weather-tool')).toBe(true);
    expect(isExactNpmVersion('2.0.0-beta.1+build.4')).toBe(true);
  });

  it.each([
    'tool; touch /tmp/injected',
    'tool$(whoami)',
    'tool`whoami`',
    'git+https://example.test/tool.git',
    'file:../../tool',
    'tool@latest',
    'tool@^1.0.0',
    'tool@1.0.0-01',
    '@scope/tool@1.0.0 --ignore-scripts',
  ])('rejects non-registry or non-exact input %s', (value) => {
    expect(() => parseNpmPackageSpec(value)).toThrow();
  });
});

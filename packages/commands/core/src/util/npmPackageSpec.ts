const PACKAGE_PART = /^[a-z0-9][a-z0-9._~-]*$/;
const SEMVER_IDENTIFIER = /^[0-9A-Za-z-]+$/;
const isCoreNumber = (value: string): boolean => /^(?:0|[1-9][0-9]*)$/.test(value);
const validIdentifiers = (value: string, rejectLeadingZeroNumbers: boolean): boolean =>
  value.split('.').every(
    (identifier) =>
      identifier.length > 0 &&
      SEMVER_IDENTIFIER.test(identifier) &&
      (!rejectLeadingZeroNumbers || !/^[0-9]+$/.test(identifier) || isCoreNumber(identifier)),
  );

export interface NpmPackageSpec {
  name: string;
  version?: string;
  installSpec: string;
}

export function isNpmPackageName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 214) return false;
  if (value.startsWith('@')) {
    const slash = value.indexOf('/');
    if (slash < 2 || slash !== value.lastIndexOf('/')) return false;
    return (
      PACKAGE_PART.test(value.slice(1, slash)) && PACKAGE_PART.test(value.slice(slash + 1))
    );
  }
  return !value.includes('/') && PACKAGE_PART.test(value);
}

export function isExactNpmVersion(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return false;
  const buildParts = value.split('+');
  if (
    buildParts.length > 2 ||
    (buildParts[1] !== undefined && !validIdentifiers(buildParts[1], false))
  ) {
    return false;
  }
  const versionAndPrerelease = buildParts[0];
  const separator = versionAndPrerelease.indexOf('-');
  const core =
    separator < 0 ? versionAndPrerelease : versionAndPrerelease.slice(0, separator);
  const prerelease = separator < 0 ? undefined : versionAndPrerelease.slice(separator + 1);
  const coreParts = core.split('.');
  return (
    coreParts.length === 3 &&
    coreParts.every(isCoreNumber) &&
    (prerelease === undefined || validIdentifiers(prerelease, true))
  );
}

export function parseNpmPackageSpec(value: unknown): NpmPackageSpec {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error('Package must be a non-empty npm package name');
  }
  let versionSeparator = -1;
  if (value.startsWith('@')) {
    const slash = value.indexOf('/');
    const candidate = value.lastIndexOf('@');
    if (slash > 0 && candidate > slash) versionSeparator = candidate;
  } else {
    versionSeparator = value.lastIndexOf('@');
  }

  const name = versionSeparator > 0 ? value.slice(0, versionSeparator) : value;
  const version = versionSeparator > 0 ? value.slice(versionSeparator + 1) : undefined;
  if (!isNpmPackageName(name)) {
    throw new Error('Package must be an unaliased npm registry name');
  }
  if (version !== undefined && !isExactNpmVersion(version)) {
    throw new Error('Embedded package version must be an exact semantic version');
  }
  return { name, version, installSpec: version ? `${name}@${version}` : name };
}

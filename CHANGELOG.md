# Changelog

## Unreleased

- Add Pcnaid downstream CI, issue-reporting, and self-contained MCP test fixtures to support maintenance of the Pcnaid fork.
- Harden command package management against shell injection by accepting only npm registry package names with optional exact semantic versions and invoking npm with argument arrays instead of shell command strings.

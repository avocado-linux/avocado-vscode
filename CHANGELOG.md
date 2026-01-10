# Changelog

All notable changes to the Avocado DevTools extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-10

### Added

- **State Volume Explorer**: Browse files in the Avocado Docker state volume
  - View SDK, extension, and runtime sysroots
  - Open files directly in the editor
  - Copy file paths to clipboard
  - Automatic refresh on configuration changes

- **Command Palette Integration**: Quick access to common commands
  - `Avocado: Install SDK and Dependencies`
  - `Avocado: Build` with extension/runtime selection
  - `Avocado: Open SDK Shell` with context selection
  - `Avocado: Clean` with multiple clean options
  - `Avocado: Provision` for runtime provisioning
  - `Avocado: Deploy` for device deployment
  - `Avocado: Fetch` for metadata refresh

- **Terminal Integration**: Dedicated Avocado SDK terminal profile
  - Automatically enters SDK container
  - Sources the SDK environment
  - Uses correct configuration and target

- **Configuration Schema**: IntelliSense for avocado.yaml
  - Auto-completion for all configuration options
  - Hover documentation
  - Structural validation
  - Support for SDK, extensions, runtimes, and targets

### Technical Details

- Built with TypeScript and esbuild
- Supports both Docker and Podman
- Maintains a long-running container for fast file operations
- Watches for configuration file changes

[Unreleased]: https://github.com/avocado-linux/avocado-vscode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/avocado-linux/avocado-vscode/releases/tag/v0.1.0

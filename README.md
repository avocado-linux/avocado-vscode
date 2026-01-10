# Avocado DevTools

Development tools for [Avocado Linux](https://github.com/avocado-linux) builds in Visual Studio Code and Cursor.

## Features

### State Volume Explorer

Browse files in your Avocado Docker state volume directly from the VS Code sidebar. View SDK sysroots, extension sysroots, and runtime installroots without leaving your editor.

- Hierarchical file browser for the Avocado state volume
- View file contents directly in the editor
- Copy file paths with a single click
- Automatic refresh when configuration changes

### Command Palette Integration

Quick access to common Avocado CLI commands:

- **Avocado: Install SDK and Dependencies** - Set up the SDK and install packages
- **Avocado: Build** - Build extensions and runtimes with selection UI
- **Avocado: Open SDK Shell** - Launch an interactive SDK container shell
- **Avocado: Clean** - Clean volumes, stamps, or specific sysroots
- **Avocado: Provision** - Provision a runtime image
- **Avocado: Deploy** - Deploy to a device
- **Avocado: Fetch** - Refresh repository metadata

### Terminal Integration

A dedicated "Avocado SDK" terminal profile that automatically enters the SDK container with the correct configuration and environment.

### Configuration IntelliSense

Full IntelliSense support for `avocado.yaml` files:

- Auto-completion for configuration keys
- Hover documentation for all options
- Validation of configuration structure
- Support for target-specific overrides

## Requirements

- **Avocado CLI** - Install from [avocado-cli releases](https://github.com/avocado-linux/avocado-cli/releases)
- **Docker** or **Podman** - Required for container operations

## Getting Started

1. Install the Avocado CLI
2. Open a folder containing an `avocado.yaml` file
3. The extension will automatically activate
4. Use the Avocado icon in the Activity Bar to browse the state volume
5. Use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) for quick commands

## Extension Settings

This extension currently has no configurable settings. Configuration is read from your `avocado.yaml` file.

## Release Notes

### 0.1.0

Initial release:
- State volume file explorer
- Command palette integration
- Terminal profile provider
- Configuration schema and IntelliSense

## Contributing

Contributions are welcome! Please see our [contributing guidelines](https://github.com/avocado-linux/avocado-vscode/blob/main/CONTRIBUTING.md).

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

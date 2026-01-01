# Change Log

All notable changes to the "dragonstone-lang" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html), and [Semantic Versioning from Dragonstone](https://github.com/Vallereya/dragonstone/blob/v0.1.6/docs/ARCHITECTURE.md).

## [Unreleased]
- Initial release

## [1.0.0] - 2026/01/01

### Added
- Complete LSP support:
    - hover, go-to-definition
    - symbols
    - formatting
    - completion
    - diagnostics
- Syntax highlighting for: 
    - Dragonstone
    - Embedded Dragonstone
    - Forge Package Manager
- Validation fixes for error detection.
- Support for all current Dragonstone language features.

### Features
- **Syntax Highlighting** (*via TextMate grammar*):
    - For Dragonstone (*`.ds`* and *`.dragonstone`*)
    - (*temp setup*) For the Forge Package Manager (*`.forge`*)
    - (*temp setup*) Embedded Dragonstone (*`.eds`*)
- **Language Server** (*LSP*):
    - Server/Client all-in-one.
    - Auto-completion with snippets.
    - Code formatting (4-space indentation is default for dragonstone).
    - Document symbols/outline view.
    - Go to definition (F12).
    - Hover to show symbol/type info.
    - Diagnostics for syntax/semantic errors.
- **Commands:**
    - *`Dragonstone: Toggle Language Server`*   -> Enable/disable LSP
    - *`Dragonstone: Enable Language Server`*   -> Start the language server
    - *`Dragonstone: Disable Language Server`*  -> Stop the language server
- **Settings:**
    - **Toggle on/off**: Click status bar or use command palette.

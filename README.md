<p align="center">
    <div align="center"> <img src="./index/logos/dragonstone-logo-type.png" width="500"/> </div>
</p>

# vscode-dragonstone-lang
This is the official VSCode extension for the [dragonstone programming language](https://github.com/Vallereya/dragonstone), please note that this is minimal at the moment and will be extended as the language grows. If you run into any issues add it in the [issues](https://github.com/vallereya/vscode-dragonstone-lang/issues) section. Thank You!

> NOTE: Embedded Dragonstone and the Forge Package Manager are temporary for now as they are not finished themselves.

## Features:

- Basic LSP
    - Server/Client all-in-one.
    - Hover to show symbol/type info.
    - Go to definition with a simple symbol table.
    - Document symbols so Outline works.
    - Formatting.

- Syntax Highlighting (*via TextMate grammar*)
    - For Dragonstone (`.ds` and `.dragonstone`)
    - For the Forge Package Manager (`.forge`)
    - And Embedded Dragonstone (`.eds`)

## Project Layout:

```markdown
    [root/vscode-dragonstone-lang]
        ├── .vscode/                                        <- vscode launch files.
        ├── index/                                          <- assets: icons, images, and logos.
        ├── server/                                         <- lsp server.
        ├── src/                                            <- lsp client.
        ├── syntaxes/                                       <- .json files for syntax highlighting.
        │       ├── dragonstone.tmLanguage.json             <- TextMate grammar for `.ds` and `.dragonstone`.
        │       ├── dragonstone-embedded.tmLanguage.json    <- TextMate grammar `.eds`.
        │       └── dragonstone-forge.tmLanguage.json       <- TextMate grammar .forge`.
        ├── dragonstone-config.json                         <- `.ds` and `.dragonstone` .json config.
        ├── dragonstone-embedded-config.json                <- `.eds` .json config.
        ├── dragonstone-forge-config.json                   <- `.forge` .json config.
        ├── tsconfig.json
        ├── package.json
        ├── CHANGELOG
        ├── LICENSE
        ├── README.md                                   <- **you are here**
        ├── .editorconfig
        ├── .vscodeignore
        ├── .gitignore
        └── .gitattributes
```
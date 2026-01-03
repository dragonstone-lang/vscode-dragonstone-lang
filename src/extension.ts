import * as path from "node:path";
import * as vscode from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

// Start the language server.
async function startLanguageServer(context: vscode.ExtensionContext): Promise<void> {
    if (client) {
        return;
    }

    const serverModule = context.asAbsolutePath(
        path.join("server", "dist", "server.js")
    );

    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc
        },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: "dragonstone" },
            { language: "dragonstone-embedded" },
            { language: "dragonstone-forge" }
        ],
    };

    client = new LanguageClient(
        "dragonstoneLsp",
        "Dragonstone Language Server",
        serverOptions,
        clientOptions
    );

    await client.start();
    updateStatusBar(true);
}

// Stop the language server.
async function stopLanguageServer(): Promise<void> {
    if (!client) {
        return;
    }

    await client.stop();
    client = undefined;
    updateStatusBar(false);
}

function updateStatusBar(isEnabled: boolean): void {
    if (!statusBarItem) {
        return;
    }

    if (isEnabled) {
        statusBarItem.text = "$(check) Dragonstone LSP";
        statusBarItem.tooltip = "Dragonstone Language Server is running. Click to disable.";
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = "$(circle-slash) Dragonstone LSP";
        statusBarItem.tooltip = "Dragonstone Language Server is disabled. Click to enable.";
        statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
}

export async function activate(context: vscode.ExtensionContext) {

    // Create status bar item.
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = "dragonstone.toggleLsp";
    context.subscriptions.push(statusBarItem);
    statusBarItem.show();

    // Register toggle command.
    const toggleCommand = vscode.commands.registerCommand(
        "dragonstone.toggleLsp",
        async () => {
            const config = vscode.workspace.getConfiguration("dragonstone");
            const currentState = config.get<boolean>("lsp.enabled", true);
            const newState = !currentState;

            await config.update("lsp.enabled", newState, vscode.ConfigurationTarget.Global);

            if (newState) {
                await startLanguageServer(context);
                vscode.window.showInformationMessage("Dragonstone LSP enabled");
            } else {
                await stopLanguageServer();
                vscode.window.showInformationMessage("Dragonstone LSP disabled");
            }
        }
    );
    context.subscriptions.push(toggleCommand);

    // Register explicit enable command.
    const enableCommand = vscode.commands.registerCommand(
        "dragonstone.enableLsp",
        async () => {
            const config = vscode.workspace.getConfiguration("dragonstone");
            await config.update("lsp.enabled", true, vscode.ConfigurationTarget.Global);
            await startLanguageServer(context);
            vscode.window.showInformationMessage("Dragonstone LSP enabled");
        }
    );
    context.subscriptions.push(enableCommand);

    // Register explicit disable command.
    const disableCommand = vscode.commands.registerCommand(
        "dragonstone.disableLsp",
        async () => {
            const config = vscode.workspace.getConfiguration("dragonstone");
            await config.update("lsp.enabled", false, vscode.ConfigurationTarget.Global);
            await stopLanguageServer();
            vscode.window.showInformationMessage("Dragonstone LSP disabled");
        }
    );
    context.subscriptions.push(disableCommand);

    // Check configuration and start if enabled.
    const config = vscode.workspace.getConfiguration("dragonstone");
    const lspEnabled = config.get<boolean>("lsp.enabled", true);

    if (lspEnabled) {
        await startLanguageServer(context);
    } else {
        updateStatusBar(false);
    }

    // Watch for configuration changes.
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration("dragonstone.lsp.enabled")) {
                const config = vscode.workspace.getConfiguration("dragonstone");
                const isEnabled = config.get<boolean>("lsp.enabled", true);

                if (isEnabled && !client) {
                    await startLanguageServer(context);
                } else if (!isEnabled && client) {
                    await stopLanguageServer();
                }
            }
        })
    );
}

export async function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    await client?.stop();
}

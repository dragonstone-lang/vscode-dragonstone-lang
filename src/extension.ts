import * as path from "node:path";
import * as vscode from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext) {
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

    client.start();
    context.subscriptions.push(client);
}

export async function deactivate() {
    await client?.stop();
}

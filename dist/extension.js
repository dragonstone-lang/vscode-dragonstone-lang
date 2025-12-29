"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = require("node:path");
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    const serverModule = context.asAbsolutePath(path.join("server", "dist", "server.js"));
    const serverOptions = {
        run: {
            module: serverModule,
            transport: node_1.TransportKind.ipc
        },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc
        },
    };
    const clientOptions = {
        documentSelector: [
            { language: "dragonstone" },
            { language: "dragonstone-embedded" },
            { language: "dragonstone-forge" }
        ],
    };
    client = new node_1.LanguageClient("dragonstoneLsp", "Dragonstone Language Server", serverOptions, clientOptions);
    context.subscriptions.push(client.start());
}
async function deactivate() {
    await client?.stop();
}
//# sourceMappingURL=extension.js.map
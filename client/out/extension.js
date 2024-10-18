"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
const path = require("path");
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let defaultClient;
const clients = new Map();
let _sortedWorkspaceFolders;
function sortedWorkspaceFolders() {
    if (_sortedWorkspaceFolders === void 0) {
        _sortedWorkspaceFolders = vscode_1.workspace.workspaceFolders ? vscode_1.workspace.workspaceFolders.map(folder => {
            let result = folder.uri.toString();
            if (result.charAt(result.length - 1) !== '/') {
                result = result + '/';
            }
            return result;
        }).sort((a, b) => {
            return a.length - b.length;
        }) : [];
    }
    return _sortedWorkspaceFolders;
}
vscode_1.workspace.onDidChangeWorkspaceFolders(() => _sortedWorkspaceFolders = undefined);
function getOuterMostWorkspaceFolder(folder) {
    const sorted = sortedWorkspaceFolders();
    for (const element of sorted) {
        let uri = folder.uri.toString();
        if (uri.charAt(uri.length - 1) !== '/') {
            uri = uri + '/';
        }
        if (uri.startsWith(element)) {
            return vscode_1.workspace.getWorkspaceFolder(vscode_1.Uri.parse(element));
        }
    }
    return folder;
}
function activate(context) {
    const module = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
    const outputChannel = vscode_1.window.createOutputChannel('topas-language-server');
    function didOpenTextDocument(document) {
        // We are interested in TOPAS language files (e.g., .inp, .out, .inc)
        if (document.languageId !== 'topas' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
            return;
        }
        const uri = document.uri;
        // Handle untitled files with default client
        if (uri.scheme === 'untitled' && !defaultClient) {
            const serverOptions = {
                run: { module, transport: node_1.TransportKind.ipc },
                debug: { module, transport: node_1.TransportKind.ipc }
            };
            const clientOptions = {
                documentSelector: [
                    { scheme: 'untitled', language: 'topas' }
                ],
                diagnosticCollectionName: 'topas-language-server',
                outputChannel: outputChannel
            };
            defaultClient = new node_1.LanguageClient('topas-language-server', 'Topas Language Server', serverOptions, clientOptions);
            defaultClient.start();
            return;
        }
        let folder = vscode_1.workspace.getWorkspaceFolder(uri);
        if (!folder) {
            return;
        }
        folder = getOuterMostWorkspaceFolder(folder);
        if (!clients.has(folder.uri.toString())) {
            const serverOptions = {
                run: { module, transport: node_1.TransportKind.ipc },
                debug: { module, transport: node_1.TransportKind.ipc }
            };
            const clientOptions = {
                documentSelector: [
                    { scheme: 'file', language: 'topas', pattern: `${folder.uri.fsPath}/**/*` }
                ],
                diagnosticCollectionName: 'topas-language-server',
                workspaceFolder: folder,
                outputChannel: outputChannel,
                initializationOptions: {} // Removed 'capabilities'
            };
            const client = new node_1.LanguageClient('topas-language-server', 'Topas Language Server', serverOptions, clientOptions);
            client.start();
            clients.set(folder.uri.toString(), client);
        }
    }
    vscode_1.workspace.onDidOpenTextDocument(didOpenTextDocument);
    vscode_1.workspace.textDocuments.forEach(didOpenTextDocument);
    vscode_1.workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed) {
            const client = clients.get(folder.uri.toString());
            if (client) {
                clients.delete(folder.uri.toString());
                client.stop();
            }
        }
    });
}
function deactivate() {
    const promises = [];
    if (defaultClient) {
        promises.push(defaultClient.stop());
    }
    for (const client of clients.values()) {
        promises.push(client.stop());
    }
    return Promise.all(promises).then(() => undefined);
}
//# sourceMappingURL=extension.js.map
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import {
  workspace as Workspace, window as Window, ExtensionContext, TextDocument, OutputChannel, WorkspaceFolder, Uri
} from 'vscode';

import {
  LanguageClient, LanguageClientOptions, TransportKind
} from 'vscode-languageclient/node';

let defaultClient: LanguageClient;
const clients: Map<string, LanguageClient> = new Map();

let _sortedWorkspaceFolders: string[] | undefined;

function sortedWorkspaceFolders(): string[] {
  if (_sortedWorkspaceFolders === void 0) {
    _sortedWorkspaceFolders = Workspace.workspaceFolders ? Workspace.workspaceFolders.map(folder => {
      let result = folder.uri.toString();
      if (result.charAt(result.length - 1) !== '/') {
        result = result + '/';
      }
      return result;
    }).sort(
      (a, b) => {
        return a.length - b.length;
      }
    ) : [];
  }
  return _sortedWorkspaceFolders;
}

Workspace.onDidChangeWorkspaceFolders(() => _sortedWorkspaceFolders = undefined);

function getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
  const sorted = sortedWorkspaceFolders();
  for (const element of sorted) {
    let uri = folder.uri.toString();
    if (uri.charAt(uri.length - 1) !== '/') {
      uri = uri + '/';
    }
    if (uri.startsWith(element)) {
      return Workspace.getWorkspaceFolder(Uri.parse(element))!;
    }
  }
  return folder;
}

export function activate(context: ExtensionContext) {

  const module = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
  const outputChannel: OutputChannel = Window.createOutputChannel('topas-language-server');

  function didOpenTextDocument(document: TextDocument): void {
    // We are interested in TOPAS language files (e.g., .inp, .out, .inc)
    if (document.languageId !== 'topas' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
      return;
    }

    const uri = document.uri;
    // Handle untitled files with default client
    if (uri.scheme === 'untitled' && !defaultClient) {
      const serverOptions = {
        run: { module, transport: TransportKind.ipc },
        debug: { module, transport: TransportKind.ipc }
      };
      const clientOptions: LanguageClientOptions = {
        documentSelector: [
          { scheme: 'untitled', language: 'topas' }
        ],
        diagnosticCollectionName: 'topas-language-server',
        outputChannel: outputChannel
      };
      defaultClient = new LanguageClient('topas-language-server', 'Topas Language Server', serverOptions, clientOptions);
      defaultClient.start();
      return;
    }

    let folder = Workspace.getWorkspaceFolder(uri);
    if (!folder) {
      return;
    }

    folder = getOuterMostWorkspaceFolder(folder);

    if (!clients.has(folder.uri.toString())) {
      const serverOptions = {
        run: { module, transport: TransportKind.ipc },
        debug: { module, transport: TransportKind.ipc }
      };
      const clientOptions: LanguageClientOptions = {
        documentSelector: [
          { scheme: 'file', language: 'topas', pattern: `${folder.uri.fsPath}/**/*` }
        ],
        diagnosticCollectionName: 'topas-language-server',
        workspaceFolder: folder,
        outputChannel: outputChannel,
        initializationOptions: {}  // Removed 'capabilities'
      };
      const client = new LanguageClient('topas-language-server', 'Topas Language Server', serverOptions, clientOptions);
      client.start();
      clients.set(folder.uri.toString(), client);
    }
  }

  Workspace.onDidOpenTextDocument(didOpenTextDocument);
  Workspace.textDocuments.forEach(didOpenTextDocument);
  Workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        clients.delete(folder.uri.toString());
        client.stop();
      }
    }
  });
}

export function deactivate(): Thenable<void> {
  const promises: Thenable<void>[] = [];
  if (defaultClient) {
    promises.push(defaultClient.stop());
  }
  for (const client of clients.values()) {
    promises.push(client.stop());
  }
  return Promise.all(promises).then(() => undefined);
}

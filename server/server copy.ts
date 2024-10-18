/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */


import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	TextDocumentSyncKind,
	Diagnostic,
	DiagnosticSeverity,
	InitializeParams,
	TextDocumentPositionParams,
	CompletionItem,
	CompletionItemKind
  } from 'vscode-languageserver/node';
import {
	TextDocument
} from 'vscode-languageserver-textdocument';


// Creates the LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// The workspace folder this server is operating on
let workspaceFolder: string | null;

documents.onDidOpen((event) => {
	connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Document opened: ${event.document.uri}`);
});
documents.listen(connection);

connection.onInitialize((params) => {
	workspaceFolder = params.rootUri;
	connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`);
	return {
		capabilities: {
			textDocumentSync: {
				openClose: true,
				change: TextDocumentSyncKind.Full
			}
		}
	};
});

//-----------------------------------------------------------------------

const variableDefinitions: Map<string, string[]> = new Map();

// Track variables when the text document changes
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();

  // Simple regex to find variable definitions
  const variablePattern = /\b(prm|local|global)\s+(!?)(\w+)/g;
  let match;
  const diagnostics: Diagnostic[] = [];
  const definedVariables: string[] = [];

  while ((match = variablePattern.exec(text)) !== null) {
    const variableName = match[3];
    definedVariables.push(variableName);

    // Optionally add diagnostics or linting warnings
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Information,
      range: {
        start: textDocument.positionAt(match.index),
        end: textDocument.positionAt(match.index + match[0].length)
      },
      message: `Variable '${variableName}' defined.`,
      source: 'topas-language-server'
    };
    diagnostics.push(diagnostic);
  }

  variableDefinitions.set(textDocument.uri, definedVariables);

  // Send the diagnostics to the client
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// Provide completions for variable references
connection.onCompletion(
  (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const textDocument = documents.get(textDocumentPosition.textDocument.uri);
    const variables = variableDefinitions.get(textDocumentPosition.textDocument.uri) || [];

    return variables.map(variable => ({
      label: variable,
      kind: CompletionItemKind.Variable,
      data: variable
    }));
  }
);

// Initialize and listen to document events
documents.listen(connection);
connection.listen();
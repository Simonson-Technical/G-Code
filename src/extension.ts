import * as vscode from 'vscode';
import { syncView } from './commands/syncView';
import { VirtualFileSystemProvider } from './virtualFileSystem';

//vscode entry point, 
export function activate(context: vscode.ExtensionContext) {
  const virtualFs = new VirtualFileSystemProvider();

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('syncview', virtualFs, { isCaseSensitive: false })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('g-code.syncView', syncView(virtualFs))
  );
}

//manual cleanup, handle open files if vscode closes
export function deactivate(){

}






























// AI code starts here do not use just saving for reference

// import * as vscode from 'vsco
// import * as path from 'path';

// const MARKER = '$2';
// let splitState: { realDoc: vscode.TextDocument } | undefined;

// class SplitFsProvider implements vscode.FileSystemProvider {
//   private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
//   onDidChangeFile = this._emitter.event;

//   watch(): vscode.Disposable {
//     return new vscode.Disposable(() => {});
//   }

//   stat(uri: vscode.Uri): vscode.FileStat {
//     const content = this.getContent(uri);
//     return {
//       type: vscode.FileType.File,
//       ctime: Date.now(),
//       mtime: Date.now(),
//       size: Buffer.byteLength(content, 'utf8')
//     };
//   }

//   readDirectory(): [string, vscode.FileType][] { return []; }
//   createDirectory(): void { throw vscode.FileSystemError.NoPermissions(); }
//   delete(): void { throw vscode.FileSystemError.NoPermissions(); }
//   rename(): void { throw vscode.FileSystemError.NoPermissions(); }

//   readFile(uri: vscode.Uri): Uint8Array {
//     return Buffer.from(this.getContent(uri), 'utf8');
//   }

//   async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
//     if (!splitState) throw vscode.FileSystemError.Unavailable('No active split');
//     const text = Buffer.from(content).toString('utf8');
//     const side = uri.path.startsWith('/top/') ? 'top' : 'bottom';
//     await applyHalfToRealDocument(side, text);
//     this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
//   }

//   private getContent(uri: vscode.Uri): string {
//     if (!splitState) return '';
//     const lines = splitState.realDoc.getText().split('\n');
//     const markerLine = lines.findIndex(l => l.includes(MARKER));
//     if (markerLine === -1) return uri.path.startsWith('/top/') ? lines.join('\n') : '';
//     return uri.path.startsWith('/top/')
//       ? lines.slice(0, markerLine).join('\n')
//       : lines.slice(markerLine).join('\n');
//   }
// }

// async function applyHalfToRealDocument(side: 'top' | 'bottom', newText: string) {
//   if (!splitState) return;
//   const doc = splitState.realDoc;
//   const lines = doc.getText().split('\n');
//   const markerLine = lines.findIndex(l => l.includes(MARKER));
//   if (markerLine === -1) return;

//   const edit = new vscode.WorkspaceEdit();
//   if (side === 'top') {
//     edit.replace(doc.uri, new vscode.Range(0, 0, markerLine, 0), newText + '\n');
//   } else {
//     const endLine = doc.lineCount - 1;
//     const endChar = doc.lineAt(endLine).text.length;
//     edit.replace(doc.uri, new vscode.Range(markerLine, 0, endLine, endChar), newText);
//   }
//   await vscode.workspace.applyEdit(edit);
//   await doc.save();
// }

// async function splitAtMarker() {
//   const editor = vscode.window.activeTextEditor;
//   if (!editor) return;

//   const doc = editor.document;
//   const lines = doc.getText().split('\n');
//   const targetLine = lines.findIndex(l => l.includes(MARKER));

//   if (targetLine === -1) {
//     vscode.window.showInformationMessage(`No "${MARKER}" found in this file.`);
//     return;
//   }

//   splitState = { realDoc: doc };
//   const ext = path.extname(doc.uri.fsPath) || '.g-code';

//   await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
//   await vscode.window.showTextDocument(vscode.Uri.parse(`gcode-split:/top/current${ext}`), {
//     viewColumn: vscode.ViewColumn.One, preserveFocus: false
//   });
//   await vscode.window.showTextDocument(vscode.Uri.parse(`gcode-split:/bottom/current${ext}`), {
//     viewColumn: vscode.ViewColumn.Two, preserveFocus: false
//   });
// }

// async function closeSplit() {
//   if (!splitState) return;
//   const doc = splitState.realDoc;
//   splitState = undefined;

//   for (const group of vscode.window.tabGroups.all) {
//     for (const tab of group.tabs) {
//       if (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'gcode-split') {
//         await vscode.window.tabGroups.close(tab);
//       }
//     }
//   }
//   await vscode.window.showTextDocument(doc);
// }

// async function uppercaseOnOpen(doc: vscode.TextDocument) {
//   if (doc.languageId !== 'g-code') return;
//   if (doc.uri.scheme !== 'file') return; // skip virtual split docs, untitled, etc.

//   const original = doc.getText();
//   const upper = original.toUpperCase();
//   if (original === upper) return; // already uppercase, don't touch/dirty the file

//   const fullRange = new vscode.Range(
//     doc.positionAt(0),
//     doc.positionAt(original.length)
//   );

//   const edit = new vscode.WorkspaceEdit();
//   edit.replace(doc.uri, fullRange, upper);
//   await vscode.workspace.applyEdit(edit);
//   await doc.save();
// }

// export function activate(context: vscode.ExtensionContext) {
//   const provider = new SplitFsProvider();
//   context.subscriptions.push(
//     vscode.workspace.registerFileSystemProvider('gcode-split', provider, { isCaseSensitive: true })
//   );
//   context.subscriptions.push(vscode.commands.registerCommand('g-code.splitAtMarker', splitAtMarker));
//   context.subscriptions.push(vscode.commands.registerCommand('g-code.closeSplit', closeSplit));
//   context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(uppercaseOnOpen));
// }

// export function deactivate() {}
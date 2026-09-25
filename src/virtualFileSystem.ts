import * as vscode from "vscode";
import { SyncViewSession } from "./commands/syncView";

export class VirtualFileSystemProvider implements vscode.FileSystemProvider {
  private files = new Map<string, Uint8Array>();
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  constructor(private session: SyncViewSession) {
    console.log("File system created");
  }

  // Sync View Session lifecycle

  async createSyncView(
    doc: vscode.TextDocument,
    uri: vscode.Uri,
    splitMarker: string,
  ) {
    this.session.pushRealUris(uri);
    this.splitSingleFile(doc, uri, splitMarker);
    const virtualUris = this.session.getVirtualUris();
    for (const [index, uri] of virtualUris.entries()) {
      const doc = await vscode.workspace.openTextDocument(uri);
      if (index === 1) {
        await vscode.window.showTextDocument(doc);
      } else {
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      }
      this.session.activateSession();
      this.session.flagAsVirtual();
    }
  }

  private splitSingleFile(
    originalFile: vscode.TextDocument,
    originalUri: vscode.Uri,
    splitMarker: string,
  ): void {
    const text = originalFile.getText();
    const regex = new RegExp(splitMarker, "g");
    const matches = [...text.matchAll(regex)];

    if (!matches) {
      throw vscode.window.showErrorMessage("Regex operation failed.");
    }

    let currentSplitIndex = 0;
    let streamNumber = 1;

    for (const match of matches) {
      const splitText = text.slice(currentSplitIndex, match.index);
      const virtualUri = makeVirtualUri(originalUri, streamNumber.toString());
      (this as any).files.set(
        virtualUri.toString(),
        Buffer.from(splitText, "utf8"),
      );
      this.session.pushVirtualUris(streamNumber, virtualUri);
      currentSplitIndex = match.index;
      streamNumber++;
    }
    const splitText = text.slice(currentSplitIndex);
    const virtualUri = makeVirtualUri(originalUri, streamNumber.toString());
    (this as any).files.set(
      virtualUri.toString(),
      Buffer.from(splitText, "utf8"),
    );
    this.session.pushVirtualUris(streamNumber, virtualUri);
  }

  // File System Provider implementation

  watch(
    uri: vscode.Uri,
    options: { recursive: boolean; excludes: string[] },
  ): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const content = this.files.get(uri.toString());
    if (!content) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: content.length,
    };
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(): void {}

  readFile(uri: vscode.Uri): Uint8Array {
    const content = this.files.get(uri.toString());
    if (!content) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return content;
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    if (!this.session.checkIfVirtual())
      throw vscode.window.showErrorMessage("File System Error: not virtual");
    const realUri = this.session.getRealUris()[0];
    if (!realUri)
      throw vscode.FileSystemError.Unavailable("No sync view for this file");

    const newText = this.session
      .getOrderedVirtualUris()
      .map((uri) => {
        const doc = vscode.workspace.textDocuments.find(
          (d) => d.uri.toString() === uri.toString(),
        );
        return doc ? doc.getText() : "";
      })
      .join("\n");
    await this.applyToRealDocument(realUri, newText);
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  private async applyToRealDocument(realUri: vscode.Uri, newText: string) {
    const doc = await vscode.workspace.openTextDocument(realUri);
    const firstLine = doc.lineAt(0);
    const lastLine = doc.lineAt(doc.lineCount - 1);
    const fullRange = new vscode.Range(
      firstLine.range.start,
      lastLine.range.end,
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, fullRange, newText);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
  }

  delete(): void {}

  rename(): void {}
}

// Helper functions

function makeVirtualUri(originalUri: vscode.Uri, stream: string): vscode.Uri {
  const originalName = originalUri.path.split("/").pop();
  if (!originalName) {
    throw vscode.window.showErrorMessage("No file name found.");
  }
  const extension = originalName.includes(".")
    ? "." + originalName.split(".").pop()
    : "";
  const base = extension
    ? originalName.slice(0, -extension.length)
    : originalName;

  const displayPath = `/${base}(Stream ${stream})${extension}`;

  const query = new URLSearchParams({
    original: originalUri.path,
    stream,
  }).toString();

  return vscode.Uri.from({
    scheme: "syncview",
    path: displayPath,
    query,
  });
}

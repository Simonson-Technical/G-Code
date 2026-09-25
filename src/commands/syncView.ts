import * as vscode from "vscode";
import { VirtualFileSystemProvider } from "../virtualFileSystem";
import { stringify } from "querystring";

export class SyncViewSession {
  private realUris: vscode.Uri[];
  private virtualUris: Map<number, vscode.Uri>;
  private isVirtualFs: boolean;
  private isActive: boolean;

  constructor() {
    this.realUris = [];
    this.virtualUris = new Map<number, vscode.Uri>();
    this.isVirtualFs = false;
    this.isActive = false;
  }

  pushRealUris(uri: vscode.Uri): void {
    this.realUris.push(uri);
  }

  pushVirtualUris(stream: number, uri: vscode.Uri): void {
    this.virtualUris.set(stream, uri);
  }

  activateSession(): void {
    this.isActive = true;
  }

  flagAsVirtual(): void {
    this.isVirtualFs = true;
  }

  getStatus(): boolean {
    return this.isActive;
  }

  checkIfVirtual(): boolean {
    return this.isVirtualFs;
  }

  getRealUris(): vscode.Uri[] {
    return this.realUris;
  }

  getVirtualUris(): Map<number, vscode.Uri> {
    return this.virtualUris;
  }

  getOrderedVirtualUris(): vscode.Uri[] {
    return [...this.virtualUris.keys()]
      .sort((a, b) => a - b)
      .map((key) => this.virtualUris.get(key)!);
  }

  deactivateSession(): void {
    vscode.window.showInformationMessage("deactivating session");
    this.realUris.length = 0;
    this.virtualUris.clear();
    this.isVirtualFs = false;
    this.isActive = false;
  }
}

export function syncView(
  virtualFs: VirtualFileSystemProvider,
  session: SyncViewSession,
) {
  console.log("Sync view command activated");
  return async function openInVirtualFs() {
    if (session.getStatus()) {
      vscode.window.showInformationMessage("Sync view already enabled.");
      return;
    }
    const config = vscode.workspace.getConfiguration("g-code");
    const allowedExtensions = config.get<string[]>("fileExtensions")!;

    const allFiles = await vscode.workspace.findFiles("**/*");
    const workspaceFiles = allFiles.filter((uri) =>
      matchExtension(uri.fsPath, allowedExtensions),
    );

    const items = workspaceFiles.map((uri) => ({
      label: vscode.workspace.asRelativePath(uri),
      uri,
    }));

    const pickedFiles = await pickFilesOrdered(items);

    if (!pickedFiles) {
      return;
    } else if (pickedFiles.length > 1) {
      for (const [index, uri] of pickedFiles.entries()) {
        session.pushRealUris(uri);
        const doc = await vscode.workspace.openTextDocument(uri);
        if (index === 0) {
          await vscode.window.showTextDocument(doc);
        } else {
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
      }
      session.activateSession();
    } else {
      const pickedFileUri = pickedFiles.entries().next().value?.[1];
      if (!pickedFileUri) {
        throw vscode.window.showErrorMessage("File not found.");
      }
      closeDocument(pickedFileUri);
      const splitMarker = config.get<string>("splitMarker")!;
      const originalDoc =
        await vscode.workspace.openTextDocument(pickedFileUri);
      virtualFs.createSyncView(originalDoc, pickedFileUri, splitMarker);
    }
  };

  function matchExtension(filePath: string, extensions: string[]): boolean {
    const lowerPath = filePath.toLowerCase();
    return extensions.some((ext) => lowerPath.endsWith(ext.toLowerCase()));
  }
}

function closeDocument(uri: vscode.Uri) {
  const tabsToClose = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputText &&
        tab.input.uri.toString() === uri.toString(),
    );
  vscode.window.tabGroups.close(tabsToClose);
}

export function handleTabEvent(
  event: vscode.TabChangeEvent,
  session: SyncViewSession,
): void {
  if (event.closed.length === 0) return;
  if (!session.getStatus()) return;
  vscode.window.showInformationMessage("trying to handle closed file");
  for (const tab of event.closed) {
    if (tab.input instanceof vscode.TabInputText) {
      if (tab.input.uri.scheme !== "syncview") {
        session.deactivateSession();
        continue;
      } else {
        const openUris = session.getOrderedVirtualUris();
        for (const uri of openUris) {
          closeDocument(uri);
        }
        session.deactivateSession();
      }
    }
  }
}

async function pickFilesOrdered(
  items: { label: string; uri: vscode.Uri }[],
): Promise<vscode.Uri[]> {
  return new Promise((resolve) => {
    const qp = vscode.window.createQuickPick<{
      label: string;
      uri: vscode.Uri;
    }>();
    qp.items = items;
    qp.canSelectMany = true;
    qp.placeholder = "Select files";

    const orderedUris: vscode.Uri[] = [];
    let previousSelection: typeof items = [];

    qp.onDidChangeSelection((selection) => {
      const newlyAdded = selection.filter(
        (item) =>
          !previousSelection.some(
            (p) => p.uri.toString() === item.uri.toString(),
          ),
      );
      const removed = previousSelection.filter(
        (item) =>
          !selection.some((s) => s.uri.toString() === item.uri.toString()),
      );
      for (const item of newlyAdded) {
        orderedUris.push(item.uri);
      }
      for (const item of removed) {
        const idx = orderedUris.findIndex(
          (u) => u.toString() === item.uri.toString(),
        );
        if (idx !== -1) orderedUris.splice(idx, 1);
      }
      previousSelection = [...selection];
    });
    qp.onDidAccept(() => {
      qp.hide();
      resolve(orderedUris);
    });
    qp.onDidHide(() => {
      qp.dispose();
    });
    qp.show();
  });
}

import * as vscode from "vscode";
import { VirtualFileSystemProvider } from "../virtualFileSystem";
import { log } from "../logger";
import { WaitCode } from "./channelSync";

export class SyncViewFile {
  private stream: number;
  private uri: vscode.Uri;
  private channelLabel: string;
  private waitCodes: WaitCode[];
  private totalPaddingLines: number;

  constructor(stream: number, uri: vscode.Uri) {
    this.stream = stream;
    this.uri = uri;
    const channelLabels =
      vscode.workspace
        .getConfiguration("g-code")
        .get<Record<string, string>>("channelLabels") ?? {};
    this.channelLabel = channelLabels[stream.toString()];
    this.waitCodes = [];
    this.totalPaddingLines = 0;
  }

  getUri(): vscode.Uri {
    return this.uri;
  }

  getChannelNumber(): number {
    return this.stream;
  }

  getChannelLabel(): string {
    return this.channelLabel;
  }

  pushWaitCode(wait: WaitCode[]) {
    this.waitCodes.push(...wait);
  }

  getWaitCodes(): WaitCode[] {
    return this.waitCodes;
  }

  getWaitCodeByID(id: number): WaitCode | undefined {
    return this.waitCodes.find((code) => code.getId() === id) || undefined;
  }

  getMatchingWaitCode(text: string): WaitCode | undefined {
    return this.waitCodes.find((code) => code.getText() === text) || undefined;
  }

  clearWaitCodes(): void {
    this.waitCodes.length = 0;
  }

  updateTotalPadding(n: number): void {
    this.totalPaddingLines += n;
  }

  getTotalPadding(): number {
    return this.totalPaddingLines;
  }

  clearTotalPadding(): void {
    this.totalPaddingLines = 0;
  }
}

export class SyncViewSession {
  private syncFiles: SyncViewFile[];
  private originalUri?: vscode.Uri;
  private isVirtualFs: boolean;
  private isActive: boolean;
  private syncCodeMatchEnabled: boolean;
  private channelLabels: Map<string, number>;

  constructor() {
    this.syncFiles = [];
    this.originalUri = undefined;
    this.isVirtualFs = false;
    this.isActive = false;
    this.syncCodeMatchEnabled = false;
    this.channelLabels = new Map<string, number>();
  }

  setSyncCodeMatching(enabled: boolean): void {
    this.syncCodeMatchEnabled = enabled;
    vscode.commands.executeCommand(
      "setContext",
      "g-code.syncCodeMatchEnabled",
      enabled,
    );
  }

  isSyncCodeMatchingEnabled(): boolean {
    return this.syncCodeMatchEnabled;
  }

  pushSyncFiles(stream: number, uri: vscode.Uri): void {
    const syncViewFile = new SyncViewFile(stream, uri);
    this.syncFiles.push(syncViewFile);
    this.channelLabels.set(
      syncViewFile.getChannelLabel(),
      syncViewFile.getChannelNumber(),
    );
  }

  activateSession(): void {
    this.isActive = true;
  }

  setIsVirtual(enable: boolean): void {
    this.isVirtualFs = enable;
  }

  getStatus(): boolean {
    return this.isActive;
  }

  checkIfVirtual(): boolean {
    return this.isVirtualFs;
  }

  setOriginalUri(uri: vscode.Uri): void {
    this.originalUri = uri;
  }

  getOriginalUri(): vscode.Uri | undefined {
    return this.originalUri ?? undefined;
  }

  getSyncFiles(): SyncViewFile[] {
    return this.syncFiles;
  }

  getChannelLabels(): Map<string, number> {
    return this.channelLabels;
  }

  getFilesToMatch(
    requestingFileChannel: number,
    labels: string[],
  ): SyncViewFile[] {
    let files = this.getSyncFiles().filter(
      (f) => f.getChannelNumber() !== requestingFileChannel,
    );
    if (labels.length === 0) {
      return files;
    } else {
      const labelsToKeep = new Set(labels);
      return files.filter((f) => labelsToKeep.has(f.getChannelLabel()));
    }
  }

  getFileByLabel(label: string): SyncViewFile | undefined {
    return this.syncFiles.find((f) => f.getChannelLabel() === label);
  }

  getMaxWaitCodes(): number {
    let x: number = 0;
    for (const file of this.syncFiles) {
      const len = file.getWaitCodes().length;
      if (len > x) x = len;
    }
    return x;
  }

  // getOrderedRealUris(): vscode.Uri[] {
  //   return [...this.realUris.keys()]
  //     .sort((a, b) => a - b)
  //     .map((key) => this.realUris.get(key)!);
  // }

  // getVirtualUris(): Map<number, vscode.Uri> {
  //   return this.virtualUris;
  // }

  // getOrderedVirtualUris(): vscode.Uri[] {
  //   return [...this.virtualUris.keys()]
  //     .sort((a, b) => a - b)
  //     .map((key) => this.virtualUris.get(key)!);
  // }

  deactivateSession(): void {
    vscode.window.showInformationMessage("Sync View Session deactivated.");
    this.syncFiles.length = 0;
    // this.virtualUris.clear();
    this.isVirtualFs = false;
    this.isActive = false;
    this.originalUri = undefined;
    this.setSyncCodeMatching(false);
    this.channelLabels.clear();
  }
}

export function syncView(
  virtualFs: VirtualFileSystemProvider,
  session: SyncViewSession,
) {
  return async function openInVirtualFs() {
    if (session.getStatus()) {
      vscode.window.showInformationMessage("Sync View is already enabled.");
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
      let streamNumber = 1;
      for (const uri of pickedFiles) {
        session.pushSyncFiles(streamNumber, uri);
        streamNumber++;
      }
      for (const file of session.getSyncFiles()) {
        const doc = await vscode.workspace.openTextDocument(file.getUri());
        if (file.getChannelNumber() === 1) {
          await vscode.window.showTextDocument(doc);
        } else {
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
      }
      session.activateSession();
      session.setIsVirtual(false);
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
  for (const tab of event.closed) {
    if (tab.input instanceof vscode.TabInputText) {
      if (tab.input.uri.scheme !== "syncview") {
        session.deactivateSession();
        continue;
      } else {
        const openFiles = session.getSyncFiles();
        for (const file of openFiles) {
          closeDocument(file.getUri());
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

import * as vscode from "vscode";
import { syncView, SyncViewSession, handleTabEvent } from "./commands/syncView";
import { VirtualFileSystemProvider } from "./virtualFileSystem";
import { channelSync } from "./commands/channelSync";
import { initLogger, log, showLog } from "./logger";

//vscode entry point,
export function activate(context: vscode.ExtensionContext) {
  const staleTabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputText &&
        tab.input.uri.scheme === "syncview",
    );
  if (staleTabs.length > 0) {
    vscode.window.tabGroups.close(staleTabs);
  }
  initLogger();
  const syncViewSession = new SyncViewSession();
  const virtualFs = new VirtualFileSystemProvider(syncViewSession);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("syncview", virtualFs, {
      isCaseSensitive: false,
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "g-code.syncView",
      syncView(virtualFs, syncViewSession),
    ),
    vscode.commands.registerCommand("g-code.channelSyncOn", () => {
      if (!syncViewSession.getStatus()) {
        vscode.window.showInformationMessage("No current Sync View session.");
        return;
      }
      syncViewSession.setSyncCodeMatching(true);
      channelSync(syncViewSession);
    }),
    vscode.commands.registerCommand("g-code.channelSyncOff", () => {
      syncViewSession.setSyncCodeMatching(false);
      channelSync(syncViewSession);
    }),
  );

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((event) =>
      handleTabEvent(event, syncViewSession),
    ),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      channelSync(syncViewSession);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId !== "g-code") return;
      channelSync(syncViewSession);
    }),
    vscode.workspace.onDidChangeConfiguration(() =>
      channelSync(syncViewSession),
    ),
  );
}

//manual cleanup, handle open files if vscode closes
export async function deactivate() {
  const virtualTabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputText &&
        tab.input.uri.scheme === "syncview",
    );
  if (virtualTabs.length > 0) {
    await vscode.window.tabGroups.close(virtualTabs);
  }
}

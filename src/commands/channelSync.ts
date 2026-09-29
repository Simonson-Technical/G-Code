import * as vscode from "vscode";
import { SyncViewSession, SyncViewFile } from "./syncView";
import { log } from "../logger";

export class WaitCode {
  private id: number;
  private lineIndex: number;
  private channelLabels: string[];
  private matchText: string;
  private paddingLines: number;
  private isClean: boolean;
  private checked: boolean;

  constructor(lineIndex: number, text: string, id: number, labels: string[]) {
    this.id = id;
    this.lineIndex = lineIndex;
    this.matchText = text;
    this.paddingLines = 0;
    this.isClean = false;
    this.channelLabels = labels;
    this.checked = false;
  }

  getChannelLabels(): string[] {
    return this.channelLabels;
  }

  updatePadding(lines: number) {
    this.paddingLines = lines;
  }

  getPadding() {
    return this.paddingLines;
  }

  flagCleanliness(clean: boolean) {
    this.isClean = clean;
  }

  markAsChecked(checked: boolean) {
    this.checked = checked;
  }

  isChecked(): boolean {
    return this.checked;
  }

  getCleanliness() {
    return this.isClean;
  }

  getId() {
    return this.id;
  }

  getLineIndex() {
    return this.lineIndex;
  }

  getText() {
    return this.matchText;
  }
}

const matchDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
  isWholeLine: true,
});

const mismatchDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor("inputValidation.errorBackground"),
  isWholeLine: true,
});

const paddingDecorationType = vscode.window.createTextEditorDecorationType({});

export function channelSync(session: SyncViewSession) {
  if (!session.isSyncCodeMatchingEnabled() || !session.getStatus()) {
    vscode.window.visibleTextEditors.forEach((editor) => {
      editor.setDecorations(matchDecorationType, []);
      editor.setDecorations(mismatchDecorationType, []);
      editor.setDecorations(paddingDecorationType, []);
    });
    return;
  }
  const config = vscode.workspace.getConfiguration("g-code");
  const syncPattern = config.get<string>("syncPattern") ?? "";

  const syncViewFiles = session.getSyncFiles();

  for (const file of syncViewFiles) {
    file.clearWaitCodes();
    file.clearTotalPadding();
    const doc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === file.getUri().toString(),
    );
    if (!doc) {
      throw vscode.window.showErrorMessage("Cannot find document.");
    }
    file.pushWaitCode(findMatches(doc.getText(), syncPattern, session));
  }

  // for (const file of syncViewFiles) {
  //   const waitCodes = file.getWaitCodes();
  //   for (const wc of waitCodes) {
  //     if (wc.getCleanliness()) continue;
  //     const matches: WaitCode[] = [];
  //     let labels = wc.getChannelLabels();
  //     if (labels.length === 0) {
  //       labels = [...session.getChannelLabels().keys()];
  //     }
  //     for (const label of labels) {
  //       const fileToMatch = session.getFileByLabel(label);
  //       if (!fileToMatch) continue;
  //       const match = fileToMatch.getMatchingWaitCode(label);
  //       if (!match) continue;
  //       if (match.getCleanliness()) continue;
  //       matches.push(match);
  //     }
  //     if (matches.length !== labels.length) continue;
  //     wc.flagCleanliness(true);
  //     matches.forEach(m => m.flagCleanliness(true));
  //   }
  // }

  const maxCount: number = session.getMaxWaitCodes();

  const currentID: Map<string, number> = new Map(
    syncViewFiles.map((file) => [file.getChannelLabel(), 0]),
  );

  let prevWCIsMatched: boolean = true;

  for (let i = 0; i < maxCount; i++) {
    if (!prevWCIsMatched) break;
    for (const file of syncViewFiles) {
      const waitCode = file.getWaitCodes()[i];
      if (!waitCode) continue;
      if (waitCode.getCleanliness()) continue;

      let channelsToCheck = waitCode.getChannelLabels();
      if (channelsToCheck.length === 0) {
        channelsToCheck = [...session.getChannelLabels().keys()].filter(
          (l) => l !== file.getChannelLabel(),
        );
      }
      const matchingWaitCodes: [WaitCode, string][] = [];

      for (const channel of channelsToCheck) {
        const matchingChannel = session.getFileByLabel(channel);
        if (!matchingChannel) continue;
        const id = currentID.get(channel);
        if (id === undefined) {
          break;
        }
        const matchingWaitCode = matchingChannel.getWaitCodeByID(id);
        if (!matchingWaitCode) continue;
        if (matchingWaitCode.getText() === waitCode.getText()) {
          matchingWaitCode.flagCleanliness(true);
          matchingWaitCodes.push([matchingWaitCode, channel]);
        } else {
          matchingWaitCodes.push([matchingWaitCode, channel]);
        }
      }

      if ([...matchingWaitCodes.entries()].length === 0) continue;
      if (matchingWaitCodes.every((wc) => wc[0].getCleanliness() === true)) {
        waitCode.flagCleanliness(true);
        matchingWaitCodes.push([waitCode, file.getChannelLabel()]);
        for (const [wc, label] of matchingWaitCodes) {
          const n = currentID.get(label);
          if (n === undefined) break;
          currentID.set(label, n + 1);
        }
      } else {
        for (const wc of matchingWaitCodes) {
          wc[0].flagCleanliness(false);
        }
        prevWCIsMatched = false;
      }
    }
  }

  for (const file of syncViewFiles) {
    const editor = vscode.window.visibleTextEditors.find(
      (ed) => ed.document.uri.toString() === file.getUri().toString(),
    );
    if (!editor) return;
    const matchRanges: vscode.Range[] = [];
    const mismatchRanges: vscode.Range[] = [];
    const waitCodes = file.getWaitCodes();
    if (!waitCodes) continue;
    for (const waitCode of waitCodes) {
      const range = new vscode.Range(
        waitCode.getLineIndex(),
        0,
        waitCode.getLineIndex(),
        0,
      );
      if (waitCode.getCleanliness()) {
        matchRanges.push(range);
      } else {
        mismatchRanges.push(range);
      }
    }
    editor.setDecorations(matchDecorationType, matchRanges);
    editor.setDecorations(mismatchDecorationType, mismatchRanges);
    // applyPadding(editor, file);
  }
}

function findMatches(
  text: string,
  pattern: string,
  session: SyncViewSession,
  // streamNumber: number,
): WaitCode[] {
  if (!pattern) return [];
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return [];
  }

  const matches = text
    .split("\n")
    .map((line, lineIndex) => ({ lineIndex, text: line }))
    .filter(({ text }) => regex.test(text))
    .map((m, id) => ({ id, lineIndex: m.lineIndex, text: m.text }));

  const channelLabels = session.getChannelLabels();
  const waitCodes: WaitCode[] = [];

  for (const match of matches) {
    const flags = [...channelLabels.keys()];
    const present = flags.filter((f) => match.text.includes(f));
    const matchText = present.reduce(
      (text, flag) => text.replace(flag, ""),
      match.text,
    );
    waitCodes.push(
      new WaitCode(match.lineIndex, matchText.trim(), match.id, present),
    );
  }

  return waitCodes;
}

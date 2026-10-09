import * as vscode from "vscode";
import { SyncViewSession, SyncViewFile } from "./syncView";
import { log } from "../logger";

export class WaitCode {
  private id: number;
  private lineIndex: number;
  private channelLabels: string[];
  private matchText: string;
  private isClean: boolean;
  private checked: boolean;

  constructor(lineIndex: number, text: string, id: number, labels: string[]) {
    this.id = id;
    this.lineIndex = lineIndex;
    this.matchText = text;
    this.isClean = false;
    this.channelLabels = labels;
    this.checked = false;
  }

  getChannelLabels(): string[] {
    return this.channelLabels;
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

const duplicateStatusItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Left,
  100,
);

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
    const doc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === file.getUri().toString(),
    );
    if (!doc) {
      throw vscode.window.showErrorMessage("Cannot find document.");
    }
    file.pushWaitCode(
      findMatches(doc.getText(), syncPattern, session, file.getChannelLabel()),
    );
  }

  const maxCount: number = session.getMaxWaitCodes();

  const currentID: Map<string, number> = new Map(
    syncViewFiles.map((file) => [file.getChannelLabel(), 0]),
  );

  checkForDuplicateWaitCodes(session);

  // for (const file of syncViewFiles) {
  //   const currentChannelLabel = file.getChannelLabel();
  //   for (const wc of file.getWaitCodes()) {
  //     if (wc.isChecked()) continue;
  //     let channelsToCheck = wc.getChannelLabels();
  //     if (channelsToCheck.length === 0) {
  //       channelsToCheck = [...session.getChannelLabels().keys()].filter((l) => l !== currentChannelLabel);
  //     }
  //     for (const channel of channelsToCheck) {
  //       const fileToMatch = session.getFileByLabel(channel);
  //       if (!fileToMatch) continue;

  //       const matchingWaitCode = fileToMatch.getMatchingWaitCode(wc.getText());
  //       if (!matchingWaitCode) {

  //       } else {

  //       }

  //     }
  //   }
  // }

  for (let i = 0; i < maxCount; i++) {
    for (const file of syncViewFiles) {
      const waitCode = file.getWaitCodes()[i];
      const currentChannelLabel = file.getChannelLabel();
      if (!waitCode) continue;
      if (waitCode.getCleanliness()) continue;
      if (waitCode.isChecked()) continue;

      let channelsToCheck = waitCode.getChannelLabels();
      if (channelsToCheck.length === 0) {
        channelsToCheck = [...session.getChannelLabels().keys()].filter(
          (l) => l !== currentChannelLabel,
        );
      }
      log("---------------------------------------");
      log(`Current channel label: ${currentChannelLabel}`);
      log(`Channels to check: ${channelsToCheck}`);
      const matchingWaitCodes: [WaitCode, string][] = [];

      for (const channel of channelsToCheck) {
        log(`Checking channel ${channel} for ${waitCode.getText()}`);
        const matchingChannel = session.getFileByLabel(channel);
        if (!matchingChannel) continue;
        const id = currentID.get(channel);
        if (id === undefined) {
          break;
        }
        const matchingWaitCode = matchingChannel.getMatchingWaitCode(
          waitCode.getText(),
        );
        if (!matchingWaitCode) {
          log("Did not find.");
          continue;
        }
        if (
          matchingWaitCode.getChannelLabels().includes(currentChannelLabel) ||
          matchingWaitCode.getChannelLabels().length === 0
        ) {
          matchingWaitCode.flagCleanliness(true);
          matchingWaitCode.markAsChecked(true);
          matchingWaitCodes.push([matchingWaitCode, channel]);
          log(`Found clean waitcode: ${waitCode.getText()}`);
        } else {
          matchingWaitCodes.push([matchingWaitCode, channel]);
          log(`Found dirty waitcode: ${waitCode.getText()}`);
        }
      }

      if ([...matchingWaitCodes.entries()].length === 0) continue;
      if (
        matchingWaitCodes.length !== channelsToCheck.length ||
        !matchingWaitCodes.every((wc) => wc[0].getCleanliness() === true)
      ) {
        for (const wc of matchingWaitCodes) {
          wc[0].flagCleanliness(false);
        }
      } else {
        waitCode.flagCleanliness(true);
        waitCode.markAsChecked(true);
        for (const wc of matchingWaitCodes) {
          wc[0].markAsChecked(true);
        }
      }
    }
  }
  // resetWaitCodeChecking(session);
  // checkForOutOfOrderWaitCodes(session);
  // cascadeDirtyWaitCodes(session);

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
  }
}

function findMatches(
  text: string,
  pattern: string,
  session: SyncViewSession,
  channelLabel: string,
): WaitCode[] {
  if (!pattern) return [];
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return [];
  }

  const channelLabels = session.getChannelLabels();
  const flags = [...channelLabels.keys()];
  const waitCodes: WaitCode[] = [];
  let id = 0;

  text.split("\n").forEach((line, lineIndex) => {
    const m = regex.exec(line);
    if (!m) return;

    const present = flags.filter((f) => m[0].includes(f));
    const matchText = present
      .reduce((t, flag) => t.replace(flag, ""), m[0])
      .trim();
    waitCodes.push(
      new WaitCode(
        lineIndex,
        matchText,
        id++,
        present.filter((l) => l !== channelLabel),
      ),
    );
  });

  return waitCodes;
}

function checkForDuplicateWaitCodes(session: SyncViewSession): void {
  const lines: string[] = [];

  for (const file of session.getSyncFiles()) {
    const waitCodes = file.getWaitCodes();
    const checkedWCs = new Set<string>();

    waitCodes.forEach((wc) => {
      if (checkedWCs.has(wc.getText())) {
        lines.push(`Channel ${file.getChannelNumber()}, line ${wc.getLineIndex() + 1}: ${wc.getText()}`);
      } else {
        checkedWCs.add(wc.getText());
      }
    });
  }

  if (lines.length === 0) {
    duplicateStatusItem.hide();
    return;
  }

  duplicateStatusItem.text = `$(info) ${lines.length} duplicate sync code${lines.length === 1 ? "" : "s"}`;
  duplicateStatusItem.tooltip = lines.join("\n");
  duplicateStatusItem.show();
}

function longestIncreasingKeep(seq: number[]): Set<number> {
  // returns indices of seq that belong to one longest strictly-increasing subsequence
  const tails: number[] = []; // seq value at end of best run of each length
  const tailIdx: number[] = [];
  const prev: number[] = new Array(seq.length).fill(-1);

  seq.forEach((v, i) => {
    let lo = 0,
      hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  });

  const keep = new Set<number>();
  let k = tailIdx.length ? tailIdx[tailIdx.length - 1] : -1;
  while (k !== -1) {
    keep.add(k);
    k = prev[k];
  }
  return keep;
}

function checkForOutOfOrderWaitCodes(session: SyncViewSession): void {
  const files = session.getSyncFiles();
  const labels = files.map((f) => f.getChannelLabel());
  const outOfOrder = new Set<WaitCode>();

  // Per file: text -> first clean wait code with that text (duplicates are already red)
  const byText = files.map((file) => {
    const map = new Map<string, WaitCode>();
    for (const wc of file.getWaitCodes()) {
      if (!wc.getCleanliness() || map.has(wc.getText())) continue;
      map.set(wc.getText(), wc);
    }
    return map;
  });

  const targets = (wc: WaitCode, other: string) =>
    wc.getChannelLabels().length === 0 || wc.getChannelLabels().includes(other);

  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const bMap = byText[j];
      const bIndex = new Map(
        files[j].getWaitCodes().map((wc, idx) => [wc, idx]),
      );

      // wait codes in A (line order) that have a counterpart in B
      const shared = files[i].getWaitCodes().filter((wc) => {
        const b = bMap.get(wc.getText());
        return (
          byText[i].get(wc.getText()) === wc &&
          b !== undefined &&
          targets(wc, labels[j]) &&
          targets(b, labels[i])
        );
      });

      const seq = shared.map((wc) => bIndex.get(bMap.get(wc.getText())!)!);
      const keep = longestIncreasingKeep(seq);

      seq.forEach((_, k) => {
        if (keep.has(k)) return;
        outOfOrder.add(shared[k]);
        outOfOrder.add(bMap.get(shared[k].getText())!);
      });
    }
  }

  // Apply after all pairs so one pair's result doesn't change another's input
  for (const wc of outOfOrder) wc.flagCleanliness(false);
}

function cascadeDirtyWaitCodes(session: SyncViewSession): void {
  const files = session.getSyncFiles();

  // Mark a wait code dirty, and mark its counterparts in other files dirty too.
  const markDirty = (wc: WaitCode, file: SyncViewFile): void => {
    if (!wc.getCleanliness()) return; // already dirty, nothing new to propagate
    wc.flagCleanliness(false);

    const own = file.getChannelLabel();
    let channels = wc.getChannelLabels();
    if (channels.length === 0) {
      channels = [...session.getChannelLabels().keys()].filter(
        (l) => l !== own,
      );
    }

    for (const channel of channels) {
      const other = session.getFileByLabel(channel);
      if (!other) continue;
      const match = other.getMatchingWaitCode(wc.getText());
      if (match) markDirty(match, other);
    }
  };

  let changed: boolean;
  do {
    changed = false;
    for (const file of files) {
      const ordered = [...file.getWaitCodes()].sort(
        (a, b) => a.getLineIndex() - b.getLineIndex(),
      );
      let dirtySeen = false;
      for (const wc of ordered) {
        if (dirtySeen) {
          if (wc.getCleanliness()) {
            markDirty(wc, file);
            changed = true;
          }
        } else if (!wc.getCleanliness()) {
          dirtySeen = true;
        }
      }
    }
  } while (changed);
}

function resetWaitCodeChecking(session: SyncViewSession): void {
  for (const file of session.getSyncFiles()) {
    for (const wc of file.getWaitCodes()) {
      wc.markAsChecked(false);
    }
  }
}
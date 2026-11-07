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
  private hostFile: SyncViewFile;

  constructor(
    lineIndex: number,
    text: string,
    id: number,
    labels: string[],
    file: SyncViewFile,
  ) {
    this.id = id;
    this.lineIndex = lineIndex;
    this.matchText = text;
    this.isClean = false;
    this.channelLabels = labels;
    this.checked = false;
    this.hostFile = file;
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

  getHostFile() {
    return this.hostFile;
  }
}

const matchedWaitCodes: Barrier[] = [];

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
      findWaitCodes(
        doc.getText(),
        syncPattern,
        session,
        file
      ),
    );
  }

  const maxCount: number = session.getMaxWaitCodes();

  //check for matching wait codes across files
  checkForMatchingWaitCodes(session, maxCount);
  resetWaitCodeChecking(session);

  //check for out of order sync codes
  checkForOutOfOrderWaitCodes(session);
  resetWaitCodeChecking(session);

  //mark all waitcodes dirty after first dirty waitcode
  cascadeDirtyWaitCodes(session);

  //warn user of duplicate wait codes
  checkForDuplicateWaitCodes(session);

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

function findWaitCodes(
  text: string,
  pattern: string,
  session: SyncViewSession,
  file: SyncViewFile
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
        present.filter((l) => l !== file.getChannelLabel()),
        file,
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
        lines.push(
          `Channel ${file.getChannelNumber()}, line ${wc.getLineIndex() + 1}: ${wc.getText()}`,
        );
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

//uses Tarjans SCC
function checkForOutOfOrderWaitCodes(session: SyncViewSession): void {
  const edgesMap = buildEdgesMap(session.getSyncFiles());

  let visitCounter = 0;
  const visitNumber = new Map<Barrier, number>();
  const lowest = new Map<Barrier, number>();
  const path: Barrier[] = [];
  const onPath = new Set<Barrier>();
  const groups: Barrier[][] = [];

  function walk(barrier: Barrier): void {
    visitNumber.set(barrier, visitCounter);
    lowest.set(barrier, visitCounter);
    visitCounter++;
    path.push(barrier);
    onPath.add(barrier);

    for (const next of edgesMap.get(barrier) ?? []) {
      if (!visitNumber.has(next)) {
        walk(next);
        lowest.set(barrier, Math.min(lowest.get(barrier)!, lowest.get(next)!));
      } else if (onPath.has(next)) {
        lowest.set(barrier, Math.min(lowest.get(barrier)!, visitNumber.get(next)!));
      }
    }

    if (lowest.get(barrier) === visitNumber.get(barrier)) {
      const group: Barrier[] = [];
      let member: Barrier;
      do {
        member = path.pop()!;
        onPath.delete(member);
        group.push(member);
      } while (member !== barrier);
      groups.push(group);
    }
  }

  for (const barrier of edgesMap.keys()) {
    if (!visitNumber.has(barrier)) walk(barrier);
  }

  // a group of 2+ barriers is a knot: flag every wait code in it dirty
  for (const group of groups) {
    if (group.length < 2) continue;
    for (const barrier of group) {
      for (const wc of barrier.matched) wc.flagCleanliness(false);
    }
  }
}

type Barrier = {
  requiredCount: number,
  matched: WaitCode[]
};

function buildEdgesMap(files: SyncViewFile[]): Map<Barrier, Set<Barrier>> {
  // which barrier does each wait code belong to?
  const barrierOf = new Map<WaitCode, Barrier>();
  for (const b of matchedWaitCodes) {
    for (const wc of b.matched) {
      if (!barrierOf.has(wc)) barrierOf.set(wc, b);
    }
  }

  // every barrier gets an entry, even with no arrows
  const edges = new Map<Barrier, Set<Barrier>>();
  for (const b of matchedWaitCodes) edges.set(b, new Set());

  // each file adds one arrow per pair of neighbors
  for (const file of files) {
    const codes = [...file.getWaitCodes()].sort(
      (a, b) => a.getLineIndex() - b.getLineIndex(),
    );
    for (let i = 1; i < codes.length; i++) {
      const from = barrierOf.get(codes[i - 1]);
      const to = barrierOf.get(codes[i]);
      if (!from || !to || from === to) continue;
      edges.get(from)!.add(to);
    }
  }
  return edges;
}

function cascadeDirtyWaitCodes(session: SyncViewSession): void {
  // which barrier does each wait code belong to?
  const barrierOf = new Map<WaitCode, Barrier>();
  for (const b of matchedWaitCodes) {
    for (const wc of b.matched) {
      if (!barrierOf.has(wc)) barrierOf.set(wc, b);
    }
  }

  // each file's wait codes in line order
  const ordered = session
    .getSyncFiles()
    .map((file) =>
      [...file.getWaitCodes()].sort(
        (a, b) => a.getLineIndex() - b.getLineIndex(),
      ),
    );

  let changed: boolean;
  do {
    changed = false;
    for (const codes of ordered) {
      const first = codes.findIndex((wc) => !wc.getCleanliness());
      if (first === -1) continue; // no dirty code in this file

      for (let i = first + 1; i < codes.length; i++) {
        const wc = codes[i];
        // the code itself plus its copies in other files
        const targets = barrierOf.get(wc)?.matched ?? [wc];
        for (const t of targets) {
          if (t.getCleanliness()) {
            t.flagCleanliness(false);
            changed = true;
          }
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

function checkForMatchingWaitCodes(
  session: SyncViewSession,
  count: number,
): void {
  matchedWaitCodes.length = 0;
  resetWaitCodeChecking(session);
  for (let i = 0; i < count; i++) {
    for (const file of session.getSyncFiles()) {
      const wc = file.getWaitCodeByID(i);
      if (!wc) continue;
      if (wc.isChecked()) continue;

      const wcList = [wc];

      const currentChannelLabel = file.getChannelLabel();
      let channelsToCheck = wc.getChannelLabels();
      if (channelsToCheck.length === 0) {
        channelsToCheck = [...session.getChannelLabels().keys()].filter(
          (l) => l !== currentChannelLabel,
        );
      }

      for (const channelLabel of channelsToCheck) {
        const file = session.getFileByLabel(channelLabel);
        if (!file) continue;
        const matchedWC = file.getMatchingWaitCode(wc.getText());
        if (!matchedWC) continue;
        wcList.push(matchedWC);
        matchedWC.markAsChecked(true);
      }
      matchedWaitCodes.push({
        requiredCount: channelsToCheck.length + 1,
        matched: wcList,
      });
      wc.markAsChecked(true);
    }
  }
  for (const match of matchedWaitCodes) {
    if (match.requiredCount !== match.matched.length) continue;
    for (const wc of match.matched) {
      wc.flagCleanliness(true);
    }
  }
}

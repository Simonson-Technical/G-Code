// src/logger.ts
import * as vscode from "vscode";

let channel: vscode.OutputChannel;

export function initLogger() {
  channel = vscode.window.createOutputChannel("G-Code");
}

export function log(...args: unknown[]) {
  const msg = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  channel?.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

export function showLog() {
  channel?.show(true); // true = preserve focus on editor, don't steal it
}

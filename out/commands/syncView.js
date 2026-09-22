"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncView = syncView;
const vscode = __importStar(require("vscode"));
function syncView(virtualFs) {
    return async function openInVirtualFs() {
        const config = vscode.workspace.getConfiguration('g-code');
        const allowedExtensions = config.get('fileExtensions');
        const allFiles = await vscode.workspace.findFiles('**/*');
        const workspaceFiles = allFiles.filter(uri => matchExtension(uri.fsPath, allowedExtensions));
        const items = workspaceFiles.map(uri => ({
            label: vscode.workspace.asRelativePath(uri),
            uri
        }));
        const pickedFiles = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Select Files'
        });
        if (!pickedFiles) {
            return;
        }
        else if (pickedFiles.length > 1) {
            for (const [index, file] of pickedFiles.entries()) {
                const doc = await vscode.workspace.openTextDocument(file.uri);
                if (index === 0) {
                    await vscode.window.showTextDocument(doc);
                }
                else {
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
            }
        }
        else {
            const pickedFileUri = pickedFiles.entries().next().value?.[1].uri;
            if (!pickedFileUri) {
                throw console.error('no file');
            }
            const splitMarker = config.get('splitMarker');
            const originalDoc = await vscode.workspace.openTextDocument(pickedFileUri);
            const virtualUris = splitSingleFile(originalDoc, pickedFileUri, splitMarker);
            for (const [index, uri] of virtualUris.entries()) {
                const doc = await vscode.workspace.openTextDocument(uri);
                if (index === 0) {
                    await vscode.window.showTextDocument(doc);
                }
                else {
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
            }
        }
    };
    function matchExtension(filePath, extensions) {
        const lowerPath = filePath.toLowerCase();
        return extensions.some(ext => lowerPath.endsWith(ext.toLowerCase()));
    }
    function makeVirtualUri(originalUri, stream) {
        const originalName = originalUri.path.split('/').pop();
        if (!originalName) {
            throw console.error('No file name found');
        }
        console.log(originalName);
        const extension = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
        const base = extension ? originalName.slice(0, -extension.length) : originalName;
        const displayPath = `/${base}(Stream ${stream})${extension}`;
        const query = new URLSearchParams({
            original: originalUri.path,
            stream
        }).toString();
        return vscode.Uri.from({
            scheme: 'syncview',
            path: displayPath, query
        });
    }
    function splitSingleFile(originalFile, originalUri, splitMarker) {
        const text = originalFile.getText();
        const regex = new RegExp(splitMarker, 'g');
        const matches = [...text.matchAll(regex)];
        if (!matches) {
            throw console.error('no regex match');
        }
        let virtualUris = [];
        let currentSplitIndex = 0;
        let streamNumber = 1;
        for (const match of matches) {
            const splitText = text.slice(currentSplitIndex, match.index);
            const virtualUri = makeVirtualUri(originalUri, streamNumber.toString());
            virtualFs.files.set(virtualUri.toString(), Buffer.from(splitText, 'utf8'));
            virtualUris.push(virtualUri);
            currentSplitIndex = match.index;
            streamNumber++;
        }
        const splitText = text.slice(currentSplitIndex);
        const virtualUri = makeVirtualUri(originalUri, streamNumber.toString());
        virtualFs.files.set(virtualUri.toString(), Buffer.from(splitText, 'utf8'));
        virtualUris.push(virtualUri);
        return virtualUris;
    }
}
//# sourceMappingURL=syncView.js.map
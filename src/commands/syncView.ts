import * as vscode from 'vscode';
import { VirtualFileSystemProvider } from '../virtualFileSystem';

export function syncView(virtualFs: VirtualFileSystemProvider) {
    return async function openInVirtualFs() {
        const config = vscode.workspace.getConfiguration('g-code');
        const allowedExtensions = config.get<string[]>('fileExtensions')!;

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
        } else if (pickedFiles.length > 1) {
            for (const [index, file] of pickedFiles.entries()) {
                const doc = await vscode.workspace.openTextDocument(file.uri);
                if (index === 0) {
                    await vscode.window.showTextDocument(doc);        
                } else {
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);        
                }
            }
        } else {
            const pickedFileUri = pickedFiles.entries().next().value?.[1].uri;
            if (!pickedFileUri) {
                throw console.error('no file');
            }
            const splitMarker = config.get<string>('splitMarker')!;
            const originalDoc = await vscode.workspace.openTextDocument(pickedFileUri);
            const virtualUris = splitSingleFile(originalDoc, pickedFileUri, splitMarker);

            for (const [index, uri] of virtualUris.entries()) {
                const doc = await vscode.workspace.openTextDocument(uri);
                if (index === 0) {
                    await vscode.window.showTextDocument(doc);        
                } else {
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);        
                }
            }
        }
    }

    function matchExtension(filePath: string, extensions: string[]): boolean {
        const lowerPath = filePath.toLowerCase();
        return extensions.some(ext => lowerPath.endsWith(ext.toLowerCase()));   
    }

    function makeVirtualUri(originalUri: vscode.Uri, stream: string): vscode.Uri {
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

    function splitSingleFile(originalFile: vscode.TextDocument, originalUri: vscode.Uri, splitMarker: string): vscode.Uri[] {
        const text = originalFile.getText()
        const regex = new RegExp(splitMarker, 'g');
        const matches = [...text.matchAll(regex)];

        if (!matches) {
            throw console.error('no regex match');
        }

        let virtualUris: vscode.Uri[] = [];
        let currentSplitIndex = 0;
        let streamNumber = 1;

        for (const match of matches) {
            const splitText = text.slice(currentSplitIndex, match.index);
            const virtualUri = makeVirtualUri(originalUri, streamNumber.toString());
            (virtualFs as any).files.set(virtualUri.toString(), Buffer.from(splitText, 'utf8'));
            virtualUris.push(virtualUri);
            currentSplitIndex = match.index;
            streamNumber++
        }
        const splitText = text.slice(currentSplitIndex);
        const virtualUri = makeVirtualUri(originalUri, streamNumber.toString());
        (virtualFs as any).files.set(virtualUri.toString(), Buffer.from(splitText, 'utf8'));
        virtualUris.push(virtualUri);
        
        return virtualUris;
    }
}
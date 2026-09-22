import * as vscode from 'vscode';

interface SplitFile {
    originalUri: vscode.Uri;
    splitFile: Uint8Array;
}

export class VirtualFileSystemProvider implements vscode.FileSystemProvider {
    private files = new Map<string, Uint8Array>();
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;
    
    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const content = this.files.get(uri.toString());
        if(!content) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: content.length
        };
    }
    
    readDirectory(): [string, vscode.FileType][] {
        return []
    }

    createDirectory(): void {}

    readFile(uri: vscode.Uri): Uint8Array {
        const content = this.files.get(uri.toString());
        if(!content) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return content;
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void {
        this.files.set(uri.toString(), content);
        this._emitter.fire([{type: vscode.FileChangeType.Changed, uri}]);
    }

    delete(): void {}

    rename(): void {}
}
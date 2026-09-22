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
exports.VirtualFileSystemProvider = void 0;
const vscode = __importStar(require("vscode"));
class VirtualFileSystemProvider {
    constructor() {
        this.files = new Map();
        this._emitter = new vscode.EventEmitter();
        this.onDidChangeFile = this._emitter.event;
    }
    watch(uri, options) {
        return new vscode.Disposable(() => { });
    }
    stat(uri) {
        const content = this.files.get(uri.toString());
        if (!content) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: content.length
        };
    }
    readDirectory() {
        return [];
    }
    createDirectory() { }
    readFile(uri) {
        const content = this.files.get(uri.toString());
        if (!content) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return content;
    }
    writeFile(uri, content, options) {
        this.files.set(uri.toString(), content);
        this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }
    delete() { }
    rename() { }
}
exports.VirtualFileSystemProvider = VirtualFileSystemProvider;
//# sourceMappingURL=virtualFileSystem.js.map
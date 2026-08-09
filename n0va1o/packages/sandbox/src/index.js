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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxRuntime = exports.VirtualFileSystem = void 0;
exports.handlePayload = handlePayload;
const core_1 = require("@n0va1o/core");
class VirtualFileSystem {
    root;
    sessionId;
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.root = {
            name: '/',
            type: 'directory',
            children: new Map(),
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            size: 0,
        };
    }
    writeFile(path, content) {
        const normalizedPath = this.normalizePath(path);
        const parts = normalizedPath.split('/').filter(Boolean);
        const fileName = parts.pop();
        const dirPath = parts.join('/');
        let current = this.root;
        if (dirPath) {
            current = this.ensureDirectory(dirPath);
        }
        const buffer = typeof content === 'string' ? Buffer.from(content) : content;
        const node = {
            name: fileName,
            type: 'file',
            content: buffer,
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            size: buffer.length,
        };
        current.children.set(fileName, node);
        current.modifiedAt = new Date().toISOString();
        return {
            path: normalizedPath,
            size: buffer.length,
            mimeType: this.detectMimeType(fileName),
            summary: this.generateSummary(buffer, fileName),
        };
    }
    readFile(path) {
        const node = this.getNode(path);
        if (node && node.type === 'file') {
            return node.content;
        }
        return undefined;
    }
    chunkRead(path, offset, limit) {
        const content = this.readFile(path);
        if (!content)
            return Buffer.from('');
        return content.slice(offset, offset + limit);
    }
    grepSearch(path, pattern) {
        const content = this.readFile(path);
        if (!content)
            return [];
        const text = content.toString('utf-8');
        const lines = text.split('\n');
        const regex = new RegExp(pattern, 'i');
        return lines.filter(line => regex.test(line));
    }
    listDirectory(path = '/') {
        const node = this.getNode(path);
        if (!node || node.type !== 'directory')
            return [];
        return Array.from(node.children.values());
    }
    deleteFile(path) {
        const normalizedPath = this.normalizePath(path);
        const parts = normalizedPath.split('/').filter(Boolean);
        const fileName = parts.pop();
        const dirPath = parts.join('/');
        let current = this.root;
        if (dirPath) {
            current = this.getNode(dirPath);
            if (!current)
                return false;
        }
        return current.children.delete(fileName);
    }
    getDiskUsage() {
        return this.calculateSize(this.root);
    }
    normalizePath(path) {
        if (!path.startsWith('/'))
            path = '/' + path;
        return path.replace(/\/+/g, '/');
    }
    ensureDirectory(path) {
        const parts = path.split('/').filter(Boolean);
        let current = this.root;
        for (const part of parts) {
            if (!current.children.has(part)) {
                current.children.set(part, {
                    name: part,
                    type: 'directory',
                    children: new Map(),
                    createdAt: new Date().toISOString(),
                    modifiedAt: new Date().toISOString(),
                    size: 0,
                });
            }
            current = current.children.get(part);
        }
        return current;
    }
    getNode(path) {
        const normalizedPath = this.normalizePath(path);
        if (normalizedPath === '/')
            return this.root;
        const parts = normalizedPath.split('/').filter(Boolean);
        let current = this.root;
        for (const part of parts) {
            if (!current.children || !current.children.has(part))
                return undefined;
            current = current.children.get(part);
        }
        return current;
    }
    calculateSize(node) {
        if (node.type === 'file')
            return node.size;
        let total = 0;
        if (node.children) {
            for (const child of node.children.values()) {
                total += this.calculateSize(child);
            }
        }
        return total;
    }
    detectMimeType(fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const mimeTypes = {
            csv: 'text/csv',
            json: 'application/json',
            pdf: 'application/pdf',
            txt: 'text/plain',
            png: 'image/png',
            jpg: 'image/jpeg',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            html: 'text/html',
            md: 'text/markdown',
        };
        return mimeTypes[ext || ''] || 'application/octet-stream';
    }
    generateSummary(buffer, fileName) {
        const sizeKb = (buffer.length / 1024).toFixed(1);
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'csv') {
            const text = buffer.toString('utf-8');
            const lines = text.split('\n').length;
            const cols = text.split('\n')[0]?.split(',').length || 0;
            return `CSV file: ${lines} rows, ${cols} columns, ${sizeKb}KB`;
        }
        return `${ext?.toUpperCase() || 'File'}: ${sizeKb}KB`;
    }
}
exports.VirtualFileSystem = VirtualFileSystem;
class SandboxRuntime {
    environments = new Map();
    async provision(sessionId, config = {}) {
        const envId = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const fullConfig = {
            cpuQuota: config.cpuQuota ?? 2,
            ramQuota: config.ramQuota ?? 4096,
            diskQuota: config.diskQuota ?? 10240,
            timeoutSeconds: config.timeoutSeconds ?? 600,
            networkMode: config.networkMode ?? 'isolated',
            allowedDomains: config.allowedDomains ?? [],
            gpuEnabled: config.gpuEnabled ?? false,
        };
        const env = {
            id: envId,
            sessionId,
            config: fullConfig,
            vfs: new VirtualFileSystem(sessionId),
            status: 'provisioning',
            startedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + fullConfig.timeoutSeconds * 1000).toISOString(),
            cpuUsage: 0,
            ramUsageMb: 0,
        };
        this.environments.set(envId, env);
        // Simulate provisioning delay (~200ms cold start)
        await new Promise(resolve => setTimeout(resolve, 50));
        env.status = 'running';
        return env;
    }
    async execute(envId, code, language = 'python') {
        const env = this.environments.get(envId);
        if (!env)
            throw new Error('Sandbox environment not found');
        if (env.status !== 'running')
            throw new Error(`Sandbox is ${env.status}`);
        const execution = await core_1.N0VA1OGateway.executeInSandbox(env.sessionId, code, language, env.config);
        // Track resource usage
        env.cpuUsage = Math.min(env.cpuUsage + Math.random() * 20, 100);
        env.ramUsageMb = Math.min(env.ramUsageMb + Math.random() * 512, env.config.ramQuota);
        return execution;
    }
    async offloadPayload(envId, fileName, content) {
        const env = this.environments.get(envId);
        if (!env)
            throw new Error('Sandbox environment not found');
        const path = `/workspace/outputs/${fileName}`;
        return env.vfs.writeFile(path, content);
    }
    getEnvironment(envId) {
        return this.environments.get(envId);
    }
    terminate(envId) {
        const env = this.environments.get(envId);
        if (env) {
            env.status = 'terminated';
            // Memory wipe simulation
            env.vfs = new VirtualFileSystem(env.sessionId);
            this.environments.delete(envId);
        }
    }
    listEnvironments(sessionId) {
        const envs = Array.from(this.environments.values());
        if (sessionId)
            return envs.filter(e => e.sessionId === sessionId);
        return envs;
    }
}
exports.SandboxRuntime = SandboxRuntime;
// ─── Large Payload Handler ───────────────────────────────────────────────────
const PAYLOAD_THRESHOLD = 10 * 1024 * 1024; // 10MB
async function handlePayload(envId, fileName, content, runtime) {
    const buffer = typeof content === 'string' ? Buffer.from(content) : content;
    if (buffer.length > PAYLOAD_THRESHOLD) {
        const pointer = await runtime.offloadPayload(envId, fileName, buffer);
        return {
            offloaded: true,
            pointer,
            message: `File stored at ${pointer.path} (${(pointer.size / 1024 / 1024).toFixed(1)}MB). Use chunk-reader to query.`,
        };
    }
    return {
        offloaded: false,
        rawContent: buffer,
        message: `Payload size: ${(buffer.length / 1024).toFixed(1)}KB — within context window limits.`,
    };
}
__exportStar(require("@n0va1o/core"), exports);

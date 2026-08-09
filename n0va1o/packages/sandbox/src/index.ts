import { N0VA1OGateway, SandboxConfig, SandboxExecution } from '@n0va1o/core';

// ─── Virtual Filesystem ──────────────────────────────────────────────────────

export interface VFSNode {
  name: string;
  type: 'file' | 'directory';
  content?: Buffer;
  children?: Map<string, VFSNode>;
  createdAt: string;
  modifiedAt: string;
  size: number;
}

export interface FilePointer {
  path: string;
  size: number;
  mimeType: string;
  summary: string;
}

export class VirtualFileSystem {
  private root: VFSNode;
  private sessionId: string;

  constructor(sessionId: string) {
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

  writeFile(path: string, content: Buffer | string): FilePointer {
    const normalizedPath = this.normalizePath(path);
    const parts = normalizedPath.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    const dirPath = parts.join('/');

    let current = this.root;
    if (dirPath) {
      current = this.ensureDirectory(dirPath);
    }

    const buffer = typeof content === 'string' ? Buffer.from(content) : content;
    const node: VFSNode = {
      name: fileName,
      type: 'file',
      content: buffer,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      size: buffer.length,
    };

    current.children!.set(fileName, node);
    current.modifiedAt = new Date().toISOString();

    return {
      path: normalizedPath,
      size: buffer.length,
      mimeType: this.detectMimeType(fileName),
      summary: this.generateSummary(buffer, fileName),
    };
  }

  readFile(path: string): Buffer | undefined {
    const node = this.getNode(path);
    if (node && node.type === 'file') {
      return node.content;
    }
    return undefined;
  }

  chunkRead(path: string, offset: number, limit: number): Buffer {
    const content = this.readFile(path);
    if (!content) return Buffer.from('');
    return content.slice(offset, offset + limit);
  }

  grepSearch(path: string, pattern: string): string[] {
    const content = this.readFile(path);
    if (!content) return [];
    const text = content.toString('utf-8');
    const lines = text.split('\n');
    const regex = new RegExp(pattern, 'i');
    return lines.filter(line => regex.test(line));
  }

  listDirectory(path: string = '/'): VFSNode[] {
    const node = this.getNode(path);
    if (!node || node.type !== 'directory') return [];
    return Array.from(node.children!.values());
  }

  deleteFile(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const parts = normalizedPath.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    const dirPath = parts.join('/');

    let current = this.root;
    if (dirPath) {
      current = this.getNode(dirPath) as VFSNode;
      if (!current) return false;
    }

    return current.children!.delete(fileName);
  }

  getDiskUsage(): number {
    return this.calculateSize(this.root);
  }

  private normalizePath(path: string): string {
    if (!path.startsWith('/')) path = '/' + path;
    return path.replace(/\/+/g, '/');
  }

  private ensureDirectory(path: string): VFSNode {
    const parts = path.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      if (!current.children!.has(part)) {
        current.children!.set(part, {
          name: part,
          type: 'directory',
          children: new Map(),
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          size: 0,
        });
      }
      current = current.children!.get(part)!;
    }

    return current;
  }

  private getNode(path: string): VFSNode | undefined {
    const normalizedPath = this.normalizePath(path);
    if (normalizedPath === '/') return this.root;

    const parts = normalizedPath.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      if (!current.children || !current.children.has(part)) return undefined;
      current = current.children.get(part)!;
    }

    return current;
  }

  private calculateSize(node: VFSNode): number {
    if (node.type === 'file') return node.size;
    let total = 0;
    if (node.children) {
      for (const child of node.children.values()) {
        total += this.calculateSize(child);
      }
    }
    return total;
  }

  private detectMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
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

  private generateSummary(buffer: Buffer, fileName: string): string {
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

// ─── Sandbox Runtime ─────────────────────────────────────────────────────────

export interface SandboxEnvironment {
  id: string;
  sessionId: string;
  config: SandboxConfig;
  vfs: VirtualFileSystem;
  status: 'provisioning' | 'running' | 'paused' | 'terminated';
  startedAt: string;
  expiresAt: string;
  cpuUsage: number;
  ramUsageMb: number;
}

export class SandboxRuntime {
  private environments = new Map<string, SandboxEnvironment>();

  async provision(sessionId: string, config: Partial<SandboxConfig> = {}): Promise<SandboxEnvironment> {
    const envId = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const fullConfig: SandboxConfig = {
      cpuQuota: config.cpuQuota ?? 2,
      ramQuota: config.ramQuota ?? 4096,
      diskQuota: config.diskQuota ?? 10240,
      timeoutSeconds: config.timeoutSeconds ?? 600,
      networkMode: config.networkMode ?? 'isolated',
      allowedDomains: config.allowedDomains ?? [],
      gpuEnabled: config.gpuEnabled ?? false,
    };

    const env: SandboxEnvironment = {
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

  async execute(
    envId: string,
    code: string,
    language: 'python' | 'bash' = 'python'
  ): Promise<SandboxExecution> {
    const env = this.environments.get(envId);
    if (!env) throw new Error('Sandbox environment not found');
    if (env.status !== 'running') throw new Error(`Sandbox is ${env.status}`);

    const execution = await N0VA1OGateway.executeInSandbox(env.sessionId, code, language, env.config);

    // Track resource usage
    env.cpuUsage = Math.min(env.cpuUsage + Math.random() * 20, 100);
    env.ramUsageMb = Math.min(env.ramUsageMb + Math.random() * 512, env.config.ramQuota);

    return execution;
  }

  async offloadPayload(envId: string, fileName: string, content: Buffer | string): Promise<FilePointer> {
    const env = this.environments.get(envId);
    if (!env) throw new Error('Sandbox environment not found');

    const path = `/workspace/outputs/${fileName}`;
    return env.vfs.writeFile(path, content);
  }

  getEnvironment(envId: string): SandboxEnvironment | undefined {
    return this.environments.get(envId);
  }

  terminate(envId: string): void {
    const env = this.environments.get(envId);
    if (env) {
      env.status = 'terminated';
      // Memory wipe simulation
      env.vfs = new VirtualFileSystem(env.sessionId);
      this.environments.delete(envId);
    }
  }

  listEnvironments(sessionId?: string): SandboxEnvironment[] {
    const envs = Array.from(this.environments.values());
    if (sessionId) return envs.filter(e => e.sessionId === sessionId);
    return envs;
  }
}

// ─── Large Payload Handler ───────────────────────────────────────────────────

const PAYLOAD_THRESHOLD = 10 * 1024 * 1024; // 10MB

export interface PayloadResult {
  offloaded: boolean;
  pointer?: FilePointer;
  rawContent?: Buffer;
  message: string;
}

export async function handlePayload(
  envId: string,
  fileName: string,
  content: Buffer | string,
  runtime: SandboxRuntime
): Promise<PayloadResult> {
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

export * from '@n0va1o/core';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface LeaseState {
  id: string;
  pid: number;
  expires_at: number;
}

interface FailureState {
  failed_at: number;
  retry_after: number;
}

interface CoordinatorOptions {
  lockFile: string;
  failureFile: string;
  cooldownMs?: number;
  leaseMs?: number;
  now?: () => number;
}

export class OAuthCoordinator {
  private readonly lockFile: string;
  private readonly failureFile: string;
  private readonly cooldownMs: number;
  private readonly leaseMs: number;
  private readonly now: () => number;
  private inFlight: Promise<string> | null = null;

  constructor(options: CoordinatorOptions) {
    this.lockFile = options.lockFile;
    this.failureFile = options.failureFile;
    this.cooldownMs = options.cooldownMs ?? 5 * 60_000;
    this.leaseMs = options.leaseMs ?? 3 * 60_000;
    this.now = options.now ?? Date.now;
  }

  run(
    authenticate: () => Promise<string>,
    options: { ignoreCooldown?: boolean } = {}
  ): Promise<string> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.runOnce(authenticate, options).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runOnce(
    authenticate: () => Promise<string>,
    options: { ignoreCooldown?: boolean }
  ): Promise<string> {
    if (!options.ignoreCooldown) this.assertCooldownElapsed();
    const release = this.acquireLease();
    try {
      const result = await authenticate();
      this.removeFile(this.failureFile);
      return result;
    } catch (error) {
      const failedAt = this.now();
      this.writePrivateJson(this.failureFile, {
        failed_at: failedAt,
        retry_after: failedAt + this.cooldownMs,
      });
      throw error;
    } finally {
      release();
    }
  }

  private assertCooldownElapsed(): void {
    const failure = this.readJson<FailureState>(this.failureFile);
    if (!failure || failure.retry_after <= this.now()) return;
    const seconds = Math.max(
      1,
      Math.ceil((failure.retry_after - this.now()) / 1000)
    );
    throw new Error(
      `OAuth is paused after a recent failure to prevent repeated browser windows. Retry in ${seconds}s, or call mcp_auth to retry now.`
    );
  }

  private acquireLease(): () => void {
    const id = crypto.randomUUID();
    const lease: LeaseState = {
      id,
      pid: process.pid,
      expires_at: this.now() + this.leaseMs,
    };
    const candidate = fs.mkdtempSync(`${this.lockFile}.`);
    fs.chmodSync(candidate, 0o700);
    try {
      this.writePrivateJson(path.join(candidate, `${id}.json`), lease, 'wx');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // Publish a complete, nonempty directory atomically. A competing
          // nonempty lease cannot be overwritten by rename.
          fs.renameSync(candidate, this.lockFile);
          return () => this.retireLease(id);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOTDIR') throw this.legacyLockError();
          if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(code || ''))
            throw error;
          const current = this.readLease();
          if (!current) {
            this.removeEmptyLeaseDirectory();
            continue;
          }
          if (
            current.expires_at <= this.now() &&
            !this.isProcessAlive(current.pid)
          ) {
            this.retireLease(current.id);
            continue;
          }
          throw new Error(
            'OAuth is already in progress in another MCP process. Complete that browser flow or stop that process before retrying.'
          );
        }
      }
      throw new Error(
        'Unable to acquire the OAuth attempt lock. Retry after the current attempt completes.'
      );
    } finally {
      // Only our private candidate is recursively removed, never the shared lock.
      fs.rmSync(candidate, { recursive: true, force: true });
    }
  }

  private readLease(): LeaseState | null {
    let names: string[];
    try {
      names = fs.readdirSync(this.lockFile);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      if (code === 'ENOTDIR') throw this.legacyLockError();
      throw error;
    }
    if (names.length === 0) return null;
    const name = names[0];
    const lease =
      names.length === 1 && /^[a-zA-Z0-9-]+\.json$/.test(name)
        ? this.readJson<LeaseState>(path.join(this.lockFile, name))
        : null;
    if (
      !lease ||
      `${lease.id}.json` !== name ||
      !Number.isFinite(lease.expires_at) ||
      !Number.isSafeInteger(lease.pid) ||
      lease.pid <= 0
    ) {
      throw new Error(
        'OAuth lock is unreadable. Stop all MCP processes before removing the lock and retrying.'
      );
    }
    return lease;
  }

  private retireLease(id: string): void {
    // Removing an observed lease's unique child cannot delete its replacement.
    this.removeFile(path.join(this.lockFile, `${id}.json`));
    this.removeEmptyLeaseDirectory();
  }

  private removeEmptyLeaseDirectory(): void {
    try {
      fs.rmdirSync(this.lockFile);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'ENOTDIR'].includes(code || ''))
        throw error;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
  }

  private legacyLockError(): Error {
    return new Error(
      'A legacy OAuth lock exists. Stop all MCP processes, remove the old lock file, and retry.'
    );
  }

  private readJson<T>(filePath: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  private writePrivateJson(
    filePath: string,
    value: LeaseState | FailureState,
    flag: 'w' | 'wx' = 'w'
  ): void {
    fs.writeFileSync(filePath, JSON.stringify(value), {
      encoding: 'utf8',
      flag,
      mode: 0o600,
    });
  }

  private removeFile(filePath: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

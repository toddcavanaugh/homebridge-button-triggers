import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import type { PersistedStateFile } from "./types";

type Mutation = {
  key: string;
  value: boolean | undefined;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export class StateStore {
  private state = new Map<string, boolean>();
  private readonly pending: Mutation[] = [];
  private writing: Promise<void> | undefined;

  constructor(private readonly filePath: string) {}

  async load(): Promise<string | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedStateFile;
      if (parsed == null || parsed.version !== 1 || typeof parsed.switches !== "object" ||
          parsed.switches == null || Array.isArray(parsed.switches) ||
          Object.values(parsed.switches).some(value => typeof value !== "boolean")) {
        throw new Error("Unsupported state file format.");
      }
      this.state = new Map(Object.entries(parsed.switches));
    } catch {
      const backup = `${this.filePath}.corrupt-${randomUUID()}`;
      await rename(this.filePath, backup);
      this.state.clear();
      return backup;
    }
  }

  get(key: string): boolean | undefined {
    return this.state.get(key);
  }

  set(key: string, value: boolean): Promise<void> {
    return this.enqueue(key, value);
  }

  delete(key: string): Promise<void> {
    return this.enqueue(key, undefined);
  }

  async flush(): Promise<void> {
    await this.writing;
  }

  toJSON(): PersistedStateFile {
    return { version: 1, switches: Object.fromEntries(this.state) };
  }

  private enqueue(key: string, value: boolean | undefined): Promise<void> {
    const result = new Promise<void>((resolve, reject) => {
      this.pending.push({ key, value, resolve, reject });
    });
    this.writing ??= Promise.resolve().then(() => this.drain());
    return result;
  }

  private async drain(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = this.pending.splice(0);
      const next = new Map(this.state);
      for (const change of batch) {
        if (change.value === undefined) next.delete(change.key);
        else next.set(change.key, change.value);
      }
      try {
        const changed = next.size !== this.state.size || [...next].some(([key, value]) => this.state.get(key) !== value);
        if (changed) await this.save(next);
        this.state = next;
        for (const change of batch) change.resolve();
      } catch (error) {
        for (const change of batch) change.reject(error);
      }
    }
    this.writing = undefined;
  }

  private async save(state: Map<string, boolean>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify({ version: 1, switches: Object.fromEntries(state) }, null, 2)}\n`,
        { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(tempPath, this.filePath);
    } finally {
      await rm(tempPath, { force: true });
    }
  }
}

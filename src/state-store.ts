import { dirname } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { PersistedStateFile } from "./types";

export class StateStore {
  private readonly state = new Map<string, boolean>();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedStateFile;
      if (parsed.version !== 1 || typeof parsed.switches !== "object" || parsed.switches == null) {
        throw new Error("Unsupported state file format.");
      }

      this.state.clear();
      for (const [key, value] of Object.entries(parsed.switches)) {
        if (typeof value === "boolean") {
          this.state.set(key, value);
        }
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        return;
      }

      throw error;
    }
  }

  get(key: string): boolean | undefined {
    return this.state.get(key);
  }

  async set(key: string, value: boolean): Promise<void> {
    this.state.set(key, value);
    await this.save();
  }

  async delete(key: string): Promise<void> {
    if (!this.state.delete(key)) {
      return;
    }

    await this.save();
  }

  toJSON(): PersistedStateFile {
    return {
      version: 1,
      switches: Object.fromEntries(this.state.entries()),
    };
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    const tempPath = `${this.filePath}.tmp`;
    const payload = `${JSON.stringify(this.toJSON(), null, 2)}\n`;
    await writeFile(tempPath, payload, "utf8");
    await rename(tempPath, this.filePath);
  }
}

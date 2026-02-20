import {
  App,
  normalizePath,
  Notice,
  TAbstractFile,
  TFile,
  TFolder
} from "obsidian";
import {
  createQueueState,
  isQueueState,
  QueueItem,
  QueueSchedulerConfig,
  QueueState,
  QUEUE_SCHEMA_VERSION
} from "../core/queue-model";

const QUEUE_FILE_EXTENSION = ".irqueue.md";

const TABLE_HEADERS = [
  "id",
  "type",
  "target",
  "cursorLine",
  "cursorCh",
  "scrollTop",
  "createdAt",
  "updatedAt"
] as const;

type TableHeader = (typeof TABLE_HEADERS)[number];

export { QUEUE_FILE_EXTENSION };

export class QueueStore {
  private readonly app: App;
  private readonly getQueueFolderPath: () => string;

  constructor(app: App, getQueueFolderPath: () => string) {
    this.app = app;
    this.getQueueFolderPath = getQueueFolderPath;
  }

  resolveQueuePath(queueNameOrPath: string): string {
    const queueFolder = normalizePath(this.getQueueFolderPath());
    const normalizedInput = normalizePath(queueNameOrPath);
    const withExtension = normalizedInput.endsWith(QUEUE_FILE_EXTENSION)
      ? normalizedInput
      : `${normalizedInput}${QUEUE_FILE_EXTENSION}`;

    const inQueueFolder =
      withExtension === queueFolder || withExtension.startsWith(`${queueFolder}/`);

    return inQueueFolder
      ? withExtension
      : normalizePath(`${queueFolder}/${withExtension}`);
  }

  async queueExists(queueNameOrPath: string): Promise<boolean> {
    const queuePath = this.resolveQueuePath(queueNameOrPath);
    return this.getFile(queuePath) instanceof TFile;
  }

  listQueuePaths(): string[] {
    const queueFolder = normalizePath(this.getQueueFolderPath());

    return this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFile => file instanceof TFile)
      .filter((file) => file.path.endsWith(QUEUE_FILE_EXTENSION))
      .filter(
        (file) =>
          file.path === queueFolder || file.path.startsWith(`${queueFolder}/`)
      )
      .map((file) => normalizePath(file.path))
      .sort((a, b) => a.localeCompare(b));
  }

  getQueueDisplayName(queuePath: string): string {
    const normalizedQueuePath = normalizePath(queuePath);
    const queueFolder = normalizePath(this.getQueueFolderPath());
    const relative = normalizedQueuePath.startsWith(`${queueFolder}/`)
      ? normalizedQueuePath.slice(queueFolder.length + 1)
      : normalizedQueuePath;

    return relative.endsWith(QUEUE_FILE_EXTENSION)
      ? relative.slice(0, -QUEUE_FILE_EXTENSION.length)
      : relative;
  }

  async createQueue(
    queueNameOrPath: string,
    scheduler: QueueSchedulerConfig = { kind: "simple" }
  ): Promise<QueueState | null> {
    const queuePath = this.resolveQueuePath(queueNameOrPath);
    const existing = this.getFile(queuePath);

    if (existing instanceof TFile) {
      new Notice(`Queue already exists: ${queuePath}`);
      return null;
    }

    if (existing instanceof TFolder) {
      new Notice(`Queue path points to a folder: ${queuePath}`);
      return null;
    }

    await this.ensureParentFolders(queuePath);

    const queueName = this.getQueueNameFromPath(queuePath);
    const state = createQueueState(queueName, scheduler);
    const serialized = this.serializeQueue(state);

    await this.app.vault.create(queuePath, serialized);
    return state;
  }

  async loadQueue(queueNameOrPath: string): Promise<QueueState | null> {
    const queuePath = this.resolveQueuePath(queueNameOrPath);
    const file = this.getFile(queuePath);

    if (!(file instanceof TFile)) {
      new Notice(`Queue file not found: ${queuePath}`);
      return null;
    }

    let raw: string;
    try {
      raw = await this.app.vault.read(file);
    } catch {
      new Notice(`Failed to read queue file: ${queuePath}`);
      return null;
    }

    return this.parseQueueState(raw, queuePath);
  }

  async saveQueue(
    queueNameOrPath: string,
    state: QueueState
  ): Promise<boolean> {
    const queuePath = this.resolveQueuePath(queueNameOrPath);

    await this.ensureParentFolders(queuePath);

    const serialized = this.serializeQueue(state);
    const existing = this.getFile(queuePath);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, serialized);
      return true;
    }

    if (existing instanceof TFolder) {
      new Notice(`Cannot save queue to folder path: ${queuePath}`);
      return false;
    }

    await this.app.vault.create(queuePath, serialized);
    return true;
  }

  async deleteQueue(queueNameOrPath: string): Promise<boolean> {
    const queuePath = this.resolveQueuePath(queueNameOrPath);
    const existing = this.getFile(queuePath);

    if (!(existing instanceof TFile)) {
      new Notice(`Queue file not found: ${queuePath}`);
      return false;
    }

    await this.app.vault.delete(existing);
    return true;
  }

  async addItem(
    queueNameOrPath: string,
    item: QueueItem
  ): Promise<QueueState | null> {
    const queue = await this.loadQueue(queueNameOrPath);
    if (!queue) {
      return null;
    }

    if (queue.items.some((existing) => existing.id === item.id)) {
      new Notice(`Queue item already exists: ${item.id}`);
      return null;
    }

    const now = new Date().toISOString();
    queue.items.push({ ...item, updatedAt: now });
    queue.metadata.updatedAt = now;

    const saved = await this.saveQueue(queueNameOrPath, queue);
    return saved ? queue : null;
  }

  async updateItem(
    queueNameOrPath: string,
    itemId: string,
    updater: (item: QueueItem) => QueueItem
  ): Promise<QueueState | null> {
    const queue = await this.loadQueue(queueNameOrPath);
    if (!queue) {
      return null;
    }

    const index = queue.items.findIndex((item) => item.id === itemId);
    if (index < 0) {
      new Notice(`Queue item not found: ${itemId}`);
      return null;
    }

    const now = new Date().toISOString();
    const updated = updater(queue.items[index]);
    queue.items[index] = { ...updated, updatedAt: now };
    queue.metadata.updatedAt = now;

    const saved = await this.saveQueue(queueNameOrPath, queue);
    return saved ? queue : null;
  }

  async removeItem(
    queueNameOrPath: string,
    itemId: string
  ): Promise<QueueState | null> {
    const queue = await this.loadQueue(queueNameOrPath);
    if (!queue) {
      return null;
    }

    const nextItems = queue.items.filter((item) => item.id !== itemId);
    if (nextItems.length === queue.items.length) {
      new Notice(`Queue item not found: ${itemId}`);
      return null;
    }

    const now = new Date().toISOString();
    queue.items = nextItems;
    queue.metadata.updatedAt = now;

    const saved = await this.saveQueue(queueNameOrPath, queue);
    return saved ? queue : null;
  }

  private getFile(path: string): TAbstractFile | null {
    return this.app.vault.getAbstractFileByPath(path);
  }

  private getQueueNameFromPath(queuePath: string): string {
    const normalized = normalizePath(queuePath);
    const parts = normalized.split("/");
    const fileName = parts[parts.length - 1];

    if (fileName.endsWith(QUEUE_FILE_EXTENSION)) {
      return fileName.slice(0, -QUEUE_FILE_EXTENSION.length);
    }

    return fileName;
  }

  private serializeQueue(state: QueueState): string {
    const metadata = state.metadata;
    const frontmatter = [
      "---",
      `schemaVersion: ${state.schemaVersion}`,
      `id: ${metadata.id}`,
      `name: ${this.escapeFrontmatterValue(metadata.name)}`,
      `scheduler: ${metadata.scheduler.kind}`,
      `createdAt: ${metadata.createdAt}`,
      `updatedAt: ${metadata.updatedAt}`,
      "---"
    ];

    const header = `| ${TABLE_HEADERS.join(" | ")} |`;
    const separator =
      "| --- | --- | --- | ---: | ---: | ---: | --- | --- |";

    const rows = state.items.map((item) => {
      const target =
        item.type === "block"
          ? `${item.filePath}#^${item.blockId}`
          : item.filePath;

      const cursorLine = item.readingPosition.cursor?.line;
      const cursorCh = item.readingPosition.cursor?.ch;
      const scrollTop = item.readingPosition.scrollTop;

      return `| ${this.escapeCell(item.id)} | ${item.type} | ${this.escapeCell(
        target
      )} | ${this.toCell(cursorLine)} | ${this.toCell(cursorCh)} | ${this.toCell(
        scrollTop
      )} | ${this.escapeCell(item.createdAt)} | ${this.escapeCell(
        item.updatedAt
      )} |`;
    });

    return [...frontmatter, "", header, separator, ...rows, ""].join("\n");
  }

  private parseQueueState(raw: string, queuePath: string): QueueState | null {
    const base = createQueueState(this.getQueueNameFromPath(queuePath));
    const frontmatter = this.parseFrontmatter(raw);

    if (frontmatter.schemaVersion != null) {
      base.schemaVersion = frontmatter.schemaVersion;
    }

    base.metadata = {
      id: frontmatter.id ?? base.metadata.id,
      name: frontmatter.name ?? base.metadata.name,
      scheduler: {
        kind: frontmatter.scheduler === "simple" ? "simple" : base.metadata.scheduler.kind
      },
      createdAt: frontmatter.createdAt ?? base.metadata.createdAt,
      updatedAt: frontmatter.updatedAt ?? base.metadata.updatedAt
    };

    const parsedItems = this.parseItemsFromTable(raw);
    if (parsedItems === null) {
      new Notice(`Queue file has invalid format: ${queuePath}`);
      return null;
    }
    base.items = parsedItems;

    if (!isQueueState(base)) {
      new Notice(`Queue file has invalid schema: ${queuePath}`);
      return null;
    }

    return base;
  }

  private parseFrontmatter(raw: string): {
    schemaVersion?: number;
    id?: string;
    name?: string;
    scheduler?: string;
    createdAt?: string;
    updatedAt?: string;
  } {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match || !match[1]) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx <= 0) {
        continue;
      }

      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!key) {
        continue;
      }

      result[key] = this.unquoteFrontmatterValue(value);
    }

    const schemaVersionRaw = Number(result.schemaVersion);

    return {
      schemaVersion: Number.isInteger(schemaVersionRaw)
        ? schemaVersionRaw
        : QUEUE_SCHEMA_VERSION,
      id: result.id,
      name: result.name,
      scheduler: result.scheduler,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    };
  }

  private parseItemsFromTable(raw: string): QueueItem[] | null {
    const lines = raw.split(/\r?\n/);
    const tableLines = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|"));

    if (tableLines.length < 2) {
      return null;
    }

    const headers = this.parseTableRow(tableLines[0]).map((x) => x.trim());
    const headerIndex = this.mapHeaderIndex(headers);

    if (headerIndex.type == null || headerIndex.target == null) {
      return null;
    }

    const items: QueueItem[] = [];
    const dataLines = tableLines.slice(2);

    for (const line of dataLines) {
      if (!line || line === "|") {
        continue;
      }

      const cells = this.parseTableRow(line);
      const get = (name: TableHeader): string => {
        const idx = headerIndex[name];
        if (idx == null || idx >= cells.length) {
          return "";
        }
        return cells[idx].trim();
      };

      const type = get("type");
      const target = get("target");
      if (!target || (type !== "note" && type !== "block")) {
        continue;
      }

      const now = new Date().toISOString();
      const id = get("id") || this.createId("item");
      const createdAt = get("createdAt") || now;
      const updatedAt = get("updatedAt") || now;

      const cursorLine = this.parseNullableNumber(get("cursorLine"));
      const cursorCh = this.parseNullableNumber(get("cursorCh"));
      const scrollTop = this.parseNullableNumber(get("scrollTop"));

      const readingPosition = {
        cursor:
          cursorLine != null && cursorCh != null
            ? { line: cursorLine, ch: cursorCh }
            : null,
        scrollTop
      };

      if (type === "note") {
        items.push({
          id,
          type: "note",
          filePath: target,
          createdAt,
          updatedAt,
          readingPosition
        });
        continue;
      }

      const blockMatch = target.match(/^(.*)#\^([^#\^]+)$/);
      if (!blockMatch) {
        continue;
      }

      items.push({
        id,
        type: "block",
        filePath: blockMatch[1],
        blockId: blockMatch[2],
        createdAt,
        updatedAt,
        readingPosition
      });
    }

    return items;
  }

  private mapHeaderIndex(headers: string[]): Record<TableHeader, number | null> {
    const normalized = headers.map((h) => h.toLowerCase());

    return {
      id: this.findHeader(normalized, "id"),
      type: this.findHeader(normalized, "type"),
      target: this.findHeader(normalized, "target"),
      cursorLine: this.findHeader(normalized, "cursorline"),
      cursorCh: this.findHeader(normalized, "cursorch"),
      scrollTop: this.findHeader(normalized, "scrolltop"),
      createdAt: this.findHeader(normalized, "createdat"),
      updatedAt: this.findHeader(normalized, "updatedat")
    };
  }

  private findHeader(headers: string[], name: string): number | null {
    const index = headers.indexOf(name);
    return index >= 0 ? index : null;
  }

  private parseTableRow(line: string): string[] {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells: string[] = [];
    let current = "";
    let escaped = false;

    for (let i = 0; i < trimmed.length; i += 1) {
      const ch = trimmed[i];

      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === "|") {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += ch;
    }

    if (escaped) {
      current += "\\";
    }

    cells.push(current.trim());
    return cells;
  }

  private parseNullableNumber(value: string): number | null {
    if (!value) {
      return null;
    }

    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private toCell(value: number | null | undefined): string {
    return value == null ? "" : String(value);
  }

  private escapeCell(value: string): string {
    return String(value ?? "").replace(/\|/g, "\\|");
  }

  private escapeFrontmatterValue(value: string): string {
    const str = String(value ?? "");
    return /[:#\-]/.test(str) || /\s/.test(str) ? `"${str.replace(/"/g, '\\"')}"` : str;
  }

  private unquoteFrontmatterValue(value: string): string {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    return value;
  }

  private createId(prefix: string): string {
    const rand = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${rand}`;
  }

  private async ensureParentFolders(filePath: string): Promise<void> {
    const normalized = normalizePath(filePath);
    const segments = normalized.split("/");
    segments.pop();

    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.getFile(current);

      if (existing instanceof TFolder) {
        continue;
      }

      if (existing instanceof TFile) {
        throw new Error(`Cannot create folder because file exists at ${current}`);
      }

      await this.app.vault.createFolder(current);
    }
  }
}

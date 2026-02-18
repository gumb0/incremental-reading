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
  QueueState
} from "../core/queue-model";

const QUEUE_FILE_EXTENSION = ".irqueue.json";
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
    const serialized = JSON.stringify(state, null, 2);

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

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      new Notice(`Queue file is not valid JSON: ${queuePath}`);
      return null;
    }

    if (!isQueueState(parsed)) {
      new Notice(`Queue file has invalid schema: ${queuePath}`);
      return null;
    }

    return parsed;
  }

  async saveQueue(
    queueNameOrPath: string,
    state: QueueState
  ): Promise<boolean> {
    const queuePath = this.resolveQueuePath(queueNameOrPath);
    await this.ensureParentFolders(queuePath);

    const serialized = JSON.stringify(state, null, 2);
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

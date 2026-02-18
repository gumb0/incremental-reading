import {
  MarkdownView,
  Menu,
  Notice,
  Platform,
  Plugin,
  TAbstractFile,
  TFile,
  normalizePath
} from "obsidian";
import {
  createBlockQueueItem,
  createNoteQueueItem,
  QueueItem,
  QueueState,
  ReadingPosition
} from "./core/queue-model";
import { SimpleScheduler } from "./core/simple-scheduler";
import { QueueStore } from "./services/queue-store";
import { QueueSuggestModal } from "./ui/queue-suggest-modal";
import { QueueStatusModal } from "./ui/queue-status-modal";
import { TextPromptModal } from "./ui/text-prompt-modal";

interface CapturedReadingPosition {
  filePath: string;
  readingPosition: ReadingPosition;
}

export interface IncrementalReadingSettings {
  queueFolder: string;
  activeQueuePath: string | null;
}

const DEFAULT_SETTINGS: IncrementalReadingSettings = {
  queueFolder: "IncrementalReading",
  activeQueuePath: null
};

const DEFAULT_QUEUE_NAME = "default";

export default class IncrementalReadingPlugin extends Plugin {
  settings!: IncrementalReadingSettings;
  queueStore!: QueueStore;
  private statusBarEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.queueStore = new QueueStore(this.app, () => this.settings.queueFolder);

    await this.ensureActiveQueuePath();

    this.registerCommands();
    this.registerFileMenuAction();
    this.registerQuickAccess();

    this.app.workspace.onLayoutReady(() => {
      this.initializeStatusUi();
      void this.updateStatusUi();
    });
  }

  onunload(): void {
    this.statusBarEl = null;
  }

  private registerCommands(): void {
    this.addCommand({
      id: "incremental-reading-create-queue",
      name: "Create queue",
      callback: () => this.openCreateQueueModal()
    });

    this.addCommand({
      id: "incremental-reading-load-queue",
      name: "Load queue",
      callback: () => this.openLoadQueueModal()
    });

    this.addCommand({
      id: "incremental-reading-open-current",
      name: "Open current repetition",
      callback: () => this.openCurrentRepetition()
    });

    this.addCommand({
      id: "incremental-reading-next",
      name: "Next repetition",
      callback: () => this.nextRepetition()
    });

    this.addCommand({
      id: "incremental-reading-dismiss-current",
      name: "Dismiss current repetition",
      callback: () => this.dismissCurrentRepetition()
    });

    this.addCommand({
      id: "incremental-reading-add-note",
      name: "Add current note to queue",
      callback: () => this.addActiveNoteToQueue()
    });

    this.addCommand({
      id: "incremental-reading-add-block",
      name: "Add current block to queue",
      callback: () => this.addActiveBlockToQueue()
    });

    this.addCommand({
      id: "incremental-reading-show-status",
      name: "Show queue status",
      callback: () => this.openStatusModal()
    });
  }

  private registerFileMenuAction(): void {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        menu.addItem((item) => {
          item
            .setTitle("Add file to Incremental Reading queue")
            .setIcon("plus")
            .onClick(() => {
              void this.addFileToQueue(file);
            });
        });
      })
    );
  }

  private registerQuickAccess(): void {
    this.addRibbonIcon("list", "Incremental Reading status", () => {
      this.openStatusModal();
    });
  }

  private initializeStatusUi(): void {
    if (Platform.isMobile) {
      return;
    }

    this.statusBarEl = this.addStatusBarItem();
  }

  private async updateStatusUi(): Promise<void> {
    if (!this.statusBarEl) {
      return;
    }

    const status = await this.getStatusViewModel();
    this.statusBarEl.setText(
      `IR | ${status.queueName} | ${status.itemCount} | ${status.currentLabel}`
    );
  }

  private async openCreateQueueModal(): Promise<void> {
    new TextPromptModal(this.app, {
      title: "Create Incremental Reading Queue",
      placeholder: "Queue name",
      initialValue: DEFAULT_QUEUE_NAME,
      submitText: "Create",
      onSubmit: (value) => {
        void this.createQueue(value);
      }
    }).open();
  }

  private async createQueue(name: string): Promise<void> {
    if (!name) {
      new Notice("Queue name cannot be empty.");
      return;
    }

    const created = await this.queueStore.createQueue(name, { kind: "simple" });
    if (!created) {
      return;
    }

    const queuePath = this.queueStore.resolveQueuePath(name);
    await this.setActiveQueuePath(queuePath);
    new Notice(`Created queue: ${created.metadata.name}`);
    await this.updateStatusUi();
  }

  private async openLoadQueueModal(): Promise<void> {
    const paths = this.queueStore.listQueuePaths();
    if (paths.length === 0) {
      new Notice("No queues found. Create a queue first.");
      return;
    }

    new QueueSuggestModal(this.app, paths, (selectedPath) => {
      void this.setActiveQueuePath(selectedPath).then(async () => {
        const queueName = this.queueStore.getQueueDisplayName(selectedPath);
        new Notice(`Loaded queue: ${queueName}`);
        await this.updateStatusUi();
      });
    }).open();
  }

  private async openCurrentRepetition(): Promise<void> {
    const loaded = await this.loadActiveQueue();
    if (!loaded) {
      return;
    }

    const current = SimpleScheduler.current(loaded.state);
    if (!current) {
      new Notice("Queue is empty.");
      return;
    }

    await this.openQueueItem(current);
    await this.updateStatusUi();
  }

  private async nextRepetition(): Promise<void> {
    const loaded = await this.loadActiveQueue();
    if (!loaded) {
      return;
    }

    const { queuePath, state } = loaded;
    if (state.items.length === 0) {
      new Notice("Queue is empty.");
      return;
    }

    await this.persistCurrentReadingPosition(queuePath, state);
    const next = SimpleScheduler.next(state);
    await this.queueStore.saveQueue(queuePath, state);

    if (!next) {
      new Notice("Queue is empty.");
      return;
    }

    await this.openQueueItem(next);
    await this.updateStatusUi();
  }

  private async dismissCurrentRepetition(): Promise<void> {
    const loaded = await this.loadActiveQueue();
    if (!loaded) {
      return;
    }

    const { queuePath, state } = loaded;
    const removed = SimpleScheduler.dismissCurrent(state);
    if (!removed) {
      new Notice("Queue is empty.");
      return;
    }

    await this.queueStore.saveQueue(queuePath, state);

    const next = SimpleScheduler.current(state);
    if (next) {
      await this.openQueueItem(next);
    } else {
      new Notice("Dismissed current repetition. Queue is now empty.");
    }

    await this.updateStatusUi();
  }

  private async addActiveNoteToQueue(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) {
      new Notice("No active note found.");
      return;
    }

    await this.addFileToQueue(file);
  }

  private async addFileToQueue(file: TFile): Promise<void> {
    const loaded = await this.loadActiveQueue();
    if (!loaded) {
      return;
    }

    const duplicate = loaded.state.items.some(
      (item) => item.type === "note" && normalizePath(item.filePath) === normalizePath(file.path)
    );

    if (duplicate) {
      new Notice("Note already exists in queue.");
      return;
    }

    const added = await this.queueStore.addItem(
      loaded.queuePath,
      createNoteQueueItem(normalizePath(file.path))
    );

    if (added) {
      new Notice(`Added note to queue: ${file.basename}`);
      await this.updateStatusUi();
    }
  }

  private async addActiveBlockToQueue(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    const editor = view?.editor;

    if (!file || !editor) {
      new Notice("No active note editor found.");
      return;
    }

    const line = editor.getCursor().line;
    const blockId = await this.ensureBlockReference(file, line);
    if (!blockId) {
      new Notice("Failed to create block reference.");
      return;
    }

    const loaded = await this.loadActiveQueue();
    if (!loaded) {
      return;
    }

    const normalizedPath = normalizePath(file.path);
    const duplicate = loaded.state.items.some(
      (item) =>
        item.type === "block" &&
        normalizePath(item.filePath) === normalizedPath &&
        item.blockId === blockId
    );

    if (duplicate) {
      new Notice("Block already exists in queue.");
      return;
    }

    const added = await this.queueStore.addItem(
      loaded.queuePath,
      createBlockQueueItem(normalizedPath, blockId)
    );

    if (added) {
      new Notice(`Added block to queue: ${file.basename}#^${blockId}`);
      await this.updateStatusUi();
    }
  }

  private async openStatusModal(): Promise<void> {
    const status = await this.getStatusViewModel();

    new QueueStatusModal(this.app, status, {
      onOpenCurrent: async () => this.openCurrentRepetition(),
      onNext: async () => this.nextRepetition(),
      onDismiss: async () => this.dismissCurrentRepetition()
    }).open();
  }

  private async getStatusViewModel(): Promise<{
    queueName: string;
    itemCount: number;
    currentLabel: string;
  }> {
    const loaded = await this.loadActiveQueue();
    if (!loaded) {
      return {
        queueName: "None",
        itemCount: 0,
        currentLabel: "None"
      };
    }

    const current = SimpleScheduler.current(loaded.state);

    return {
      queueName: this.queueStore.getQueueDisplayName(loaded.queuePath),
      itemCount: loaded.state.items.length,
      currentLabel: current ? this.getItemLabel(current) : "None"
    };
  }

  private getItemLabel(item: QueueItem): string {
    return item.type === "block"
      ? `${item.filePath}#^${item.blockId}`
      : item.filePath;
  }

  private async loadActiveQueue(): Promise<{
    queuePath: string;
    state: QueueState;
  } | null> {
    const queuePath = await this.ensureActiveQueuePath();
    if (!queuePath) {
      return null;
    }

    const state = await this.queueStore.loadQueue(queuePath);
    if (!state) {
      return null;
    }

    return { queuePath, state };
  }

  private async ensureActiveQueuePath(): Promise<string | null> {
    if (this.settings.activeQueuePath) {
      const exists = await this.queueStore.queueExists(this.settings.activeQueuePath);
      if (exists) {
        return this.settings.activeQueuePath;
      }
    }

    const defaultQueuePath = this.queueStore.resolveQueuePath(DEFAULT_QUEUE_NAME);
    const defaultExists = await this.queueStore.queueExists(defaultQueuePath);
    if (!defaultExists) {
      const created = await this.queueStore.createQueue(DEFAULT_QUEUE_NAME, {
        kind: "simple"
      });

      if (!created) {
        return null;
      }
    }

    await this.setActiveQueuePath(defaultQueuePath);
    return defaultQueuePath;
  }

  private async setActiveQueuePath(queuePath: string): Promise<void> {
    this.settings.activeQueuePath = normalizePath(queuePath);
    await this.saveData(this.settings);
  }

  private async openQueueItem(item: QueueItem): Promise<void> {
    const link = this.getItemLabel(item);
    await this.app.workspace.openLinkText(link, "", false, { active: true });

    window.setTimeout(() => {
      this.restoreReadingPosition(item);
    }, 0);
  }

  private restoreReadingPosition(item: QueueItem): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;
    if (!editor) {
      return;
    }

    const position = item.readingPosition;
    if (position.cursor) {
      editor.setCursor(position.cursor);
    }

    if (position.scrollTop != null) {
      editor.scrollTo(null, position.scrollTop);
    }

    editor.focus();
  }

  private async persistCurrentReadingPosition(
    queuePath: string,
    state: QueueState
  ): Promise<void> {
    const current = SimpleScheduler.current(state);
    if (!current) {
      return;
    }

    const captured = this.captureReadingPosition();
    if (!captured) {
      return;
    }

    if (normalizePath(captured.filePath) !== normalizePath(current.filePath)) {
      return;
    }

    const now = new Date().toISOString();
    current.readingPosition = captured.readingPosition;
    current.updatedAt = now;
    state.metadata.updatedAt = now;

    await this.queueStore.saveQueue(queuePath, state);
  }

  private captureReadingPosition(): CapturedReadingPosition | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    const editor = view?.editor;

    if (!file || !editor) {
      return null;
    }

    const cursor = editor.getCursor();
    const scroll = editor.getScrollInfo();

    return {
      filePath: normalizePath(file.path),
      readingPosition: {
        cursor: { line: cursor.line, ch: cursor.ch },
        scrollTop: scroll.top
      }
    };
  }

  private getActiveMarkdownFile(): TFile | null {
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
  }

  private async ensureBlockReference(file: TFile, line: number): Promise<string | null> {
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);

    if (line < 0 || line >= lines.length) {
      return null;
    }

    const existing = this.extractBlockId(lines[line]);
    if (existing) {
      return existing;
    }

    const blockId = this.createBlockId();
    lines[line] = `${lines[line]} ^${blockId}`;
    await this.app.vault.modify(file, lines.join("\n"));
    return blockId;
  }

  private extractBlockId(lineText: string): string | null {
    const match = lineText.match(/\s\^([A-Za-z0-9_-]+)\s*$/);
    return match?.[1] ?? null;
  }

  private createBlockId(length = 7): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i += 1) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }
}

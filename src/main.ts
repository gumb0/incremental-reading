import { Notice, Plugin } from "obsidian";
import { QueueStore } from "./services/queue-store";

export interface IncrementalReadingSettings {
  queueFolder: string;
}

const DEFAULT_SETTINGS: IncrementalReadingSettings = {
  queueFolder: "IncrementalReading"
};

export default class IncrementalReadingPlugin extends Plugin {
  settings!: IncrementalReadingSettings;
  queueStore!: QueueStore;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.queueStore = new QueueStore(this.app, () => this.settings.queueFolder);

    this.addCommand({
      id: "incremental-reading-smoke-test",
      name: "Smoke test",
      callback: () => {
        new Notice("Incremental Reading plugin is loaded.");
      }
    });
  }

  onunload(): void {
    // No-op for now.
  }

  private async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }
}

import { App, ButtonComponent, Modal } from "obsidian";

export interface QueueStatusViewModel {
  queueName: string;
  itemCount: number;
  currentLabel: string;
}

export class QueueStatusModal extends Modal {
  private readonly status: QueueStatusViewModel;
  private readonly onOpenCurrent: () => Promise<void>;
  private readonly onNext: () => Promise<void>;
  private readonly onDismiss: () => Promise<void>;

  constructor(
    app: App,
    status: QueueStatusViewModel,
    handlers: {
      onOpenCurrent: () => Promise<void>;
      onNext: () => Promise<void>;
      onDismiss: () => Promise<void>;
    }
  ) {
    super(app);
    this.status = status;
    this.onOpenCurrent = handlers.onOpenCurrent;
    this.onNext = handlers.onNext;
    this.onDismiss = handlers.onDismiss;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h3", { text: "Incremental Reading" });
    contentEl.createEl("p", { text: `Queue: ${this.status.queueName}` });
    contentEl.createEl("p", { text: `Items: ${this.status.itemCount}` });
    contentEl.createEl("p", { text: `Current: ${this.status.currentLabel}` });

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.gap = "8px";

    new ButtonComponent(buttons)
      .setButtonText("Open Current")
      .onClick(async () => {
        await this.onOpenCurrent();
        this.close();
      });

    new ButtonComponent(buttons)
      .setButtonText("Next")
      .onClick(async () => {
        await this.onNext();
        this.close();
      });

    new ButtonComponent(buttons)
      .setButtonText("Dismiss")
      .onClick(async () => {
        await this.onDismiss();
        this.close();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

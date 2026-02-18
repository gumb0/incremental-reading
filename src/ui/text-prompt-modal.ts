import { App, ButtonComponent, Modal, TextComponent } from "obsidian";

export class TextPromptModal extends Modal {
  private readonly titleText: string;
  private readonly placeholder: string;
  private readonly initialValue: string;
  private readonly submitText: string;
  private readonly onSubmit: (value: string) => void;

  constructor(
    app: App,
    opts: {
      title: string;
      placeholder?: string;
      initialValue?: string;
      submitText?: string;
      onSubmit: (value: string) => void;
    }
  ) {
    super(app);
    this.titleText = opts.title;
    this.placeholder = opts.placeholder ?? "";
    this.initialValue = opts.initialValue ?? "";
    this.submitText = opts.submitText ?? "Submit";
    this.onSubmit = opts.onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h3", { text: this.titleText });
    const input = new TextComponent(contentEl)
      .setPlaceholder(this.placeholder)
      .setValue(this.initialValue);

    const submit = () => {
      this.onSubmit(input.getValue().trim());
      this.close();
    };

    contentEl.createEl("br");
    new ButtonComponent(contentEl).setButtonText(this.submitText).onClick(submit);

    input.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });

    input.inputEl.focus();
    input.inputEl.select();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

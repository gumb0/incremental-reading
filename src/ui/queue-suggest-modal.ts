import { App, SuggestModal } from "obsidian";

export class QueueSuggestModal extends SuggestModal<string> {
  private readonly items: string[];
  private readonly onChoose: (value: string) => void;

  constructor(app: App, items: string[], onChoose: (value: string) => void) {
    super(app);
    this.items = items;
    this.onChoose = onChoose;
    this.setPlaceholder("Select a queue");
  }

  getSuggestions(query: string): string[] {
    const lower = query.toLowerCase();
    if (!lower) {
      return this.items;
    }

    return this.items.filter((item) => item.toLowerCase().includes(lower));
  }

  renderSuggestion(item: string, el: HTMLElement): void {
    el.setText(item);
  }

  onChooseSuggestion(item: string): void {
    this.onChoose(item);
  }
}

import { QueueItem, QueueState } from "./queue-model";

function touchQueue(queue: QueueState): void {
  queue.metadata.updatedAt = new Date().toISOString();
}

export class SimpleScheduler {
  static current(queue: QueueState): QueueItem | null {
    return queue.items.length > 0 ? queue.items[0] : null;
  }

  static next(queue: QueueState): QueueItem | null {
    if (queue.items.length === 0) {
      return null;
    }

    const first = queue.items.shift();
    if (first) {
      queue.items.push(first);
      touchQueue(queue);
    }

    return this.current(queue);
  }

  static dismissCurrent(queue: QueueState): QueueItem | null {
    const removed = queue.items.shift() ?? null;
    if (removed) {
      touchQueue(queue);
    }

    return removed;
  }
}

export const QUEUE_SCHEMA_VERSION = 1 as const;

export type SchedulerKind = "simple";

export interface QueueSchedulerConfig {
  kind: SchedulerKind;
}

export interface QueueMetadata {
  id: string;
  name: string;
  scheduler: QueueSchedulerConfig;
  nextItemId: number;
  createdAt: string;
  updatedAt: string;
}

export interface CursorPosition {
  line: number;
  ch: number;
}

export interface ReadingPosition {
  cursor: CursorPosition | null;
}

export interface QueueItemBase {
  id: number;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  readingPosition: ReadingPosition;
}

export interface NoteQueueItem extends QueueItemBase {
  type: "note";
}

export interface BlockQueueItem extends QueueItemBase {
  type: "block";
  blockId: string;
}

export type QueueItem = NoteQueueItem | BlockQueueItem;

export interface QueueState {
  schemaVersion: number;
  metadata: QueueMetadata;
  items: QueueItem[];
}

const DEFAULT_READING_POSITION: ReadingPosition = {
  cursor: null
};

function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createQueueState(
  name: string,
  scheduler: QueueSchedulerConfig = { kind: "simple" }
): QueueState {
  const now = nowIso();

  return {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    metadata: {
      id: createId("queue"),
      name,
      scheduler,
      nextItemId: 1,
      createdAt: now,
      updatedAt: now
    },
    items: []
  };
}

export function createNoteQueueItem(filePath: string): NoteQueueItem {
  const now = nowIso();

  return {
    id: 0,
    type: "note",
    filePath,
    createdAt: now,
    updatedAt: now,
    readingPosition: { ...DEFAULT_READING_POSITION }
  };
}

export function createBlockQueueItem(
  filePath: string,
  blockId: string
): BlockQueueItem {
  const now = nowIso();

  return {
    id: 0,
    type: "block",
    filePath,
    blockId,
    createdAt: now,
    updatedAt: now,
    readingPosition: { ...DEFAULT_READING_POSITION }
  };
}

export function withReadingPosition<T extends QueueItem>(
  item: T,
  readingPosition: ReadingPosition
): T {
  return {
    ...item,
    updatedAt: nowIso(),
    readingPosition
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isCursorPosition(value: unknown): value is CursorPosition {
  if (!isObject(value)) {
    return false;
  }

  return Number.isInteger(value.line) && Number.isInteger(value.ch);
}

function isReadingPosition(value: unknown): value is ReadingPosition {
  if (!isObject(value)) {
    return false;
  }

  const { cursor } = value;

  const validCursor = cursor === null || isCursorPosition(cursor);
  return validCursor;
}

function isQueueMetadata(value: unknown): value is QueueMetadata {
  if (!isObject(value)) {
    return false;
  }

  if (!isObject(value.scheduler) || value.scheduler.kind !== "simple") {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.name) &&
    typeof value.nextItemId === "number" &&
    Number.isInteger(value.nextItemId) &&
    value.nextItemId >= 1 &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isQueueItem(value: unknown): value is QueueItem {
  if (!isObject(value)) {
    return false;
  }

  const common =
    typeof value.id === "number" &&
    Number.isInteger(value.id) &&
    value.id >= 1 &&
    isString(value.filePath) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    isReadingPosition(value.readingPosition);

  if (!common) {
    return false;
  }

  if (value.type === "note") {
    return true;
  }

  if (value.type === "block") {
    return isString(value.blockId);
  }

  return false;
}

export function isQueueState(value: unknown): value is QueueState {
  if (!isObject(value)) {
    return false;
  }

  if (value.schemaVersion !== QUEUE_SCHEMA_VERSION) {
    return false;
  }

  if (!isQueueMetadata(value.metadata)) {
    return false;
  }

  if (!Array.isArray(value.items)) {
    return false;
  }

  return value.items.every(isQueueItem);
}

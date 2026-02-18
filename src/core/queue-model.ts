export const QUEUE_SCHEMA_VERSION = 1 as const;

export type SchedulerKind = "simple";

export interface QueueSchedulerConfig {
  kind: SchedulerKind;
}

export interface QueueMetadata {
  id: string;
  name: string;
  scheduler: QueueSchedulerConfig;
  createdAt: string;
  updatedAt: string;
}

export interface CursorPosition {
  line: number;
  ch: number;
}

export interface ReadingPosition {
  cursor: CursorPosition | null;
  scrollTop: number | null;
}

export interface QueueItemBase {
  id: string;
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
  cursor: null,
  scrollTop: null
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
      createdAt: now,
      updatedAt: now
    },
    items: []
  };
}

export function createNoteQueueItem(filePath: string): NoteQueueItem {
  const now = nowIso();

  return {
    id: createId("item"),
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
    id: createId("item"),
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

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
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

  const { cursor, scrollTop } = value;

  const validCursor = cursor === null || isCursorPosition(cursor);
  return validCursor && isNullableNumber(scrollTop);
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
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isQueueItem(value: unknown): value is QueueItem {
  if (!isObject(value)) {
    return false;
  }

  const common =
    isString(value.id) &&
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

  if (typeof value.schemaVersion !== "number") {
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

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  QUEUE_SCHEMA_VERSION,
  createQueueState,
  createNoteQueueItem,
  createBlockQueueItem,
  isQueueState
} = require("../.test-dist/src/core/queue-model.js");

test("createQueueState returns expected defaults", () => {
  const state = createQueueState("My Queue");

  assert.equal(state.schemaVersion, QUEUE_SCHEMA_VERSION);
  assert.equal(state.metadata.name, "My Queue");
  assert.equal(state.metadata.scheduler.kind, "simple");
  assert.equal(state.metadata.nextItemId, 1);
  assert.deepEqual(state.items, []);
  assert.ok(typeof state.metadata.id === "string" && state.metadata.id.length > 0);
});

test("createNoteQueueItem and createBlockQueueItem initialize reading state", () => {
  const note = createNoteQueueItem("notes/a.md");
  const block = createBlockQueueItem("notes/b.md", "abc123");

  assert.equal(note.type, "note");
  assert.equal(note.id, 0);
  assert.equal(note.filePath, "notes/a.md");
  assert.deepEqual(note.readingPosition, { cursor: null });

  assert.equal(block.type, "block");
  assert.equal(block.id, 0);
  assert.equal(block.filePath, "notes/b.md");
  assert.equal(block.blockId, "abc123");
  assert.deepEqual(block.readingPosition, { cursor: null });
});

test("isQueueState accepts valid state and rejects invalid shape", () => {
  const valid = createQueueState("Valid Queue");
  const persisted = createNoteQueueItem("notes/c.md");
  persisted.id = 1;
  valid.metadata.nextItemId = 2;
  valid.items.push(persisted);

  assert.equal(isQueueState(valid), true);

  const invalid = {
    schemaVersion: 1,
    metadata: valid.metadata,
    items: [{ ...createNoteQueueItem("notes/d.md"), readingPosition: { cursor: { line: 1 } } }]
  };

  assert.equal(isQueueState(invalid), false);
});

test("isQueueState rejects unsupported schema versions", () => {
  const state = createQueueState("Versioned Queue");
  state.schemaVersion = QUEUE_SCHEMA_VERSION + 1;

  assert.equal(isQueueState(state), false);
});

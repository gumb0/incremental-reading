const test = require("node:test");
const assert = require("node:assert/strict");

const { QueueStore } = require("../.test-dist/src/services/queue-store.js");
const {
  createNoteQueueItem,
  createQueueState
} = require("../.test-dist/src/core/queue-model.js");
const {
  TFile,
  TFolder,
  __getNotices,
  __resetNotices
} = require("./shims/obsidian-shim.cjs");

function createMockApp() {
  const files = new Map();

  const vault = {
    getAbstractFileByPath(path) {
      const entry = files.get(path);
      return entry ? entry.node : null;
    },
    async createFolder(path) {
      if (files.has(path)) throw new Error(`Path already exists: ${path}`);
      files.set(path, { type: "folder", node: new TFolder(path) });
    },
    async create(path, data) {
      if (files.has(path)) throw new Error(`Path already exists: ${path}`);
      const file = new TFile(path);
      files.set(path, { type: "file", node: file, data: String(data) });
      return file;
    },
    async read(file) {
      const entry = files.get(file.path);
      if (!entry || entry.type !== "file") throw new Error("File missing");
      return entry.data;
    },
    async modify(file, data) {
      const entry = files.get(file.path);
      if (!entry || entry.type !== "file") throw new Error("File missing");
      entry.data = String(data);
    },
    async delete(file) {
      files.delete(file.path);
    }
  };

  return {
    app: { vault },
    files
  };
}

test("QueueStore create/load/save/delete roundtrip", async () => {
  __resetNotices();
  const { app } = createMockApp();
  const store = new QueueStore(app, () => "Queues");

  const created = await store.createQueue("Daily");
  assert.ok(created);
  assert.equal(created.metadata.name, "Daily");

  const loaded = await store.loadQueue("Daily");
  assert.ok(loaded);
  assert.equal(loaded.metadata.name, "Daily");

  loaded.items.push(createNoteQueueItem("notes/today.md"));
  const saved = await store.saveQueue("Daily", loaded);
  assert.equal(saved, true);

  const loadedAgain = await store.loadQueue("Daily");
  assert.equal(loadedAgain.items.length, 1);

  const removed = await store.deleteQueue("Daily");
  assert.equal(removed, true);

  const missing = await store.loadQueue("Daily");
  assert.equal(missing, null);
  assert.ok(__getNotices().some((n) => n.includes("not found")));
});

test("QueueStore reports invalid JSON queue file", async () => {
  __resetNotices();
  const { app, files } = createMockApp();
  const store = new QueueStore(app, () => "Queues");

  files.set("Queues/Broken.irqueue.json", {
    type: "file",
    node: new TFile("Queues/Broken.irqueue.json"),
    data: "{invalid-json"
  });

  const loaded = await store.loadQueue("Broken");
  assert.equal(loaded, null);
  assert.ok(__getNotices().some((n) => n.includes("not valid JSON")));
});

test("QueueStore add/update/remove item lifecycle", async () => {
  __resetNotices();
  const { app } = createMockApp();
  const store = new QueueStore(app, () => "Queues");

  await store.createQueue("Work");

  const item = createNoteQueueItem("work/task.md");
  const afterAdd = await store.addItem("Work", item);
  assert.ok(afterAdd);
  assert.equal(afterAdd.items.length, 1);

  const afterUpdate = await store.updateItem("Work", item.id, (existing) => ({
    ...existing,
    readingPosition: { cursor: { line: 4, ch: 2 }, scrollTop: 200 }
  }));
  assert.ok(afterUpdate);
  assert.deepEqual(afterUpdate.items[0].readingPosition, {
    cursor: { line: 4, ch: 2 },
    scrollTop: 200
  });

  const afterRemove = await store.removeItem("Work", item.id);
  assert.ok(afterRemove);
  assert.equal(afterRemove.items.length, 0);
});

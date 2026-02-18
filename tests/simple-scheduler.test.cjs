const test = require("node:test");
const assert = require("node:assert/strict");

const { createQueueState, createNoteQueueItem } = require("../.test-dist/src/core/queue-model.js");
const { SimpleScheduler } = require("../.test-dist/src/core/simple-scheduler.js");

test("SimpleScheduler current/next/dismiss behavior", () => {
  const queue = createQueueState("sched");
  const a = createNoteQueueItem("a.md");
  const b = createNoteQueueItem("b.md");
  queue.items.push(a, b);

  assert.equal(SimpleScheduler.current(queue).id, a.id);

  const next = SimpleScheduler.next(queue);
  assert.equal(next.id, b.id);
  assert.deepEqual(queue.items.map((item) => item.id), [b.id, a.id]);

  const removed = SimpleScheduler.dismissCurrent(queue);
  assert.equal(removed.id, b.id);
  assert.equal(SimpleScheduler.current(queue).id, a.id);
});

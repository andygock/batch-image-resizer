import assert from "node:assert/strict";
import test from "node:test";
import { createWorkerTask, disposeWorkerPools } from "./workerTask.js";

test.afterEach(disposeWorkerPools);

function setup(options = {}) {
  const workers = [];
  const run = createWorkerTask(
    () => {
      const worker = {
        postMessage(message) {
          this.message = message;
        },
        terminate() {
          this.terminated = true;
        },
      };
      workers.push(worker);
      return worker;
    },
    { label: "Test", reuse: true, ...options },
  );
  return { run, workers };
}

test("successful jobs reuse a worker, while cancellation rejects and replaces it", async () => {
  const { run, workers } = setup();
  const first = run({ id: 1 }, new AbortController().signal);
  workers[0].onmessage({ data: { id: 1 } });
  assert.deepEqual(await first, { id: 1 });
  const controller = new AbortController();
  const second = run({ id: 2 }, controller.signal);
  assert.equal(workers.length, 1);
  const late = workers[0].onmessage;
  controller.abort();
  await assert.rejects(second, { name: "AbortError" });
  late({ data: { id: 2 } });
  assert.equal(workers[0].terminated, true);
  const third = run({ id: 3 }, new AbortController().signal);
  workers[1].onmessage({ data: { id: 3 } });
  await third;
});

test("overlapping requests have separate ownership and retain only one idle worker", async () => {
  const { run, workers } = setup();
  const a = run("a", new AbortController().signal);
  const b = run("b", new AbortController().signal);
  assert.equal(workers.length, 2);
  workers[1].onmessage({ data: { value: "b" } });
  workers[0].onmessage({ data: { value: "a" } });
  assert.deepEqual(await Promise.all([a, b]), [{ value: "a" }, { value: "b" }]);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[1].terminated, undefined);
  disposeWorkerPools();
  assert.equal(workers[1].terminated, true);
});

test("invalid responses and postMessage failures discard workers", async () => {
  const { run, workers } = setup({
    validate(data) {
      assert.ok(data.buffer);
    },
  });
  const first = run({}, new AbortController().signal);
  workers[0].onmessage({ data: {} });
  await assert.rejects(first);
  assert.equal(workers[0].terminated, true);
  const second = run({}, new AbortController().signal);
  workers[1].onmessageerror();
  await assert.rejects(second, /Invalid Test/);
  assert.equal(workers[1].terminated, true);
  const broken = createWorkerTask(
    () => ({
      postMessage() {
        throw new Error("clone failed");
      },
      terminate() {},
    }),
    { label: "Clone" },
  );
  await assert.rejects(
    broken({}, new AbortController().signal),
    /clone failed/,
  );
});

test("idle workers expire", async () => {
  const { run, workers } = setup({ idleMs: 5 });
  const pending = run({}, new AbortController().signal);
  workers[0].onmessage({ data: {} });
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(workers[0].terminated, true);
});

test("disposing a pool prevents an already-running request from retaining its worker", async () => {
  const { run, workers } = setup();
  const pending = run({}, new AbortController().signal);
  disposeWorkerPools();
  workers[0].onmessage({ data: {} });
  await pending;
  assert.equal(workers[0].terminated, true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createComparisonSessions } from "./comparisonSessions.js";

const entry = (size) => ({
  draft: { format: "jpeg" },
  result: { blob: new Blob([new Uint8Array(size)]) },
  split: 25,
});

test("comparison sessions evict least recently used entries within count and byte limits", () => {
  const sessions = createComparisonSessions({ maxEntries: 2, maxBytes: 10 });
  sessions.set("a", entry(4));
  sessions.set("b", entry(4));
  sessions.get("a");
  sessions.set("c", entry(4));
  assert.equal(sessions.get("b"), undefined);
  assert.equal(sessions.get("a").split, 25);
  sessions.set("d", entry(8));
  assert.equal(sessions.get("a"), undefined);
  assert.equal(sessions.get("c"), undefined);
  assert.ok(sessions.get("d"));
});

test("shared A/B blobs count once and oversized candidates release only their pixels", () => {
  const sessions = createComparisonSessions({ maxBytes: 10 });
  const shared = entry(6);
  sessions.set("a", { ...shared, candidateA: { result: shared.result } });
  assert.ok(sessions.get("a").candidateA);
  sessions.set("large", {
    ...entry(11),
    candidateA: { result: entry(11).result },
    compareOutputs: true,
  });
  assert.ok(sessions.get("a"));
  const large = sessions.get("large");
  assert.equal(large.result, null);
  assert.equal(large.candidateA, null);
  assert.equal(large.draft.format, "jpeg");
  assert.equal(large.compareOutputs, false);
  sessions.remove(["a"]);
  assert.equal(sessions.get("a"), undefined);
  sessions.clear();
  assert.equal(sessions.get("large"), undefined);
});

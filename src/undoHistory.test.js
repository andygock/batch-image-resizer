import test from "node:test";
import assert from "node:assert/strict";
import { restoreRemovedSources, appendUndo } from "./undoHistory.js";

test("undo restores removed order without discarding later additions", () => {
  const source = (id) => ({ id, file: new Blob([id]) });
  const a = source("a"),
    b = source("b"),
    c = source("c"),
    d = source("d");
  assert.deepEqual(
    restoreRemovedSources(
      [b, d],
      [
        { source: c, index: 2 },
        { source: a, index: 0 },
      ],
    ),
    [a, b, c, d],
  );
  assert.deepEqual(restoreRemovedSources([a, b], [{ source: a, index: 0 }]), [
    a,
    b,
  ]);
});

test("undo history is bounded without dropping the newest large action", () => {
  const entry = {
    removed: [{ source: { file: { size: 200 * 1024 * 1024 } }, index: 0 }],
    outputs: [],
  };
  assert.equal(appendUndo([entry], entry).length, 1);
});

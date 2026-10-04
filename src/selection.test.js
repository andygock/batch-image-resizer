import assert from "node:assert/strict";
import test from "node:test";
import { updateSelection } from "./selection.js";

test("range selection works in both directions without losing other selections", () => {
  assert.deepEqual(
    [...updateSelection(new Set(["d"]), ["a", "b", "c", "d"], "c", "a", true)],
    ["d", "a", "b", "c"],
  );
  assert.deepEqual(
    [
      ...updateSelection(
        new Set(["a", "b", "c", "d"]),
        ["a", "b", "c", "d"],
        "a",
        "c",
        true,
      ),
    ],
    ["d"],
  );
  assert.deepEqual(
    [...updateSelection(new Set(), ["a", "b"], "removed", "b", true)],
    ["b"],
  );
});

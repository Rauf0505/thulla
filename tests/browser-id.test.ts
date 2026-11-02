import { test } from "node:test";
import assert from "node:assert/strict";
import { browserId } from "../src/browser-id";
test("browser IDs use secure bytes and have UUID v4 format", () => {
  const ids = Array.from({ length: 1000 }, browserId);
  assert.equal(new Set(ids).size, 1000);
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});

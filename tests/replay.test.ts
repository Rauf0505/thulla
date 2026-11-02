import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, play, begin, legal } from "../src/engine";
import { botCard } from "../src/bot";
test("identical random stream replays identical rules states", () => {
  function run() {
    let seed = 9;
    const rng = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    let g = createGame(
      Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: String(i) })),
      rng,
    );
    const states = [];
    for (let i = 0; i < 3000 && g.phase !== "finished"; i++) {
      g =
        g.phase === "between"
          ? begin(g)
          : play(
              g,
              g.turn,
              botCard({ choices: legal(g, g.turn), lead: g.pile[0]?.card }),
              rng,
            );
      states.push({ ...g, deadline: 0 });
    }
    assert.equal(g.phase, "finished");
    return states;
  }
  assert.deepEqual(run(), run());
});

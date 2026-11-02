import { test } from "node:test";
import assert from "node:assert/strict";
import {
  begin,
  createGame,
  deck,
  Game,
  legal,
  play,
  take,
} from "../src/engine";
import { botCard } from "../src/bot";
const seats = Array.from({ length: 8 }, (_, i) => ({
  id: String(i),
  name: `Player ${i}`,
}));
function seed(n: number) {
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 2 ** 32;
  };
}
function fixture(hands: string[][]): Game {
  return {
    players: hands.map((hand, i) => ({
      id: String(i),
      name: String(i),
      hand,
      escaped: false,
    })),
    turn: "0",
    phase: "playing",
    opening: false,
    trickNumber: 2,
    pile: [],
    participants: hands.map((_, i) => String(i)),
    waste: ["2C", "3C", "4C"],
    drawn: false,
    forced: null,
    loser: null,
    message: "",
    deadline: 0,
  };
}
test("equal deal and forced Ace of Spades", () => {
  for (let n = 3; n <= 8; n++) {
    const g = createGame(seats.slice(0, n), seed(2));
    assert.equal(new Set(g.players.flatMap((p) => p.hand)).size, 52);
    assert.deepEqual(legal(g, g.turn), ["AS"]);
    assert.ok(
      Math.max(...g.players.map((p) => p.hand.length)) -
        Math.min(...g.players.map((p) => p.hand.length)) <=
        1,
    );
  }
});
test("opening accepts off suit and always discards", () => {
  let g = fixture([
    ["AS", "2H"],
    ["3H", "4H"],
    ["KS", "5H"],
  ]);
  g.opening = true;
  g.forced = "AS";
  g = play(g, "0", "AS");
  g = play(g, "1", "3H");
  assert.equal(g.phase, "playing");
  g = play(g, "2", "KS");
  assert.equal(g.waste.length, 6);
  assert.equal(g.turn, "0");
});
test("illegal play leaves input unchanged", () => {
  const g = fixture([["2H", "AS"], ["3H"], ["4H"]]);
  g.pile = [{ player: "2", card: "4H" }];
  const before = JSON.stringify(g);
  assert.throws(() => play(g, "0", "AS"));
  assert.equal(JSON.stringify(g), before);
});
test("Thulla stops immediately and revives final-card highest player", () => {
  let g = fixture([["AH"], ["2S", "3S"], ["3H"]]);
  g = play(g, "0", "AH");
  g = play(g, "1", "2S");
  assert.equal(g.phase, "between");
  assert.deepEqual(g.players[0].hand, ["AH", "2S"]);
  assert.equal(g.players[0].escaped, false);
  assert.deepEqual(g.players[2].hand, ["3H"]);
});
test("empty winner draws only previous waste and must lead draw", () => {
  let g = fixture([["AH"], ["2H", "AS"], ["3H", "KS"]]);
  g = play(g, "0", "AH");
  g = play(g, "1", "2H");
  g = play(g, "2", "3H", () => 0);
  assert.deepEqual(g.players[0].hand, ["2C"]);
  g = begin(g);
  assert.deepEqual(legal(g, "0"), ["2C"]);
});
test("simultaneous two-player final cards: high card loses", () => {
  let g = fixture([["AH"], ["2H"]]);
  g = play(g, "0", "AH");
  g = play(g, "1", "2H");
  assert.equal(g.loser, "0");
});
test("drawn two-player lead and Thulla ends immediately", () => {
  let g = fixture([["2C"], ["AH", "AS"]]);
  g.drawn = true;
  g = play(g, "0", "2C");
  g = play(g, "1", "AH");
  assert.equal(g.loser, "0");
});
test("hand-taking transfers leader and preserves fixed deadline", () => {
  const g = fixture([["AH"], ["2H"], ["3H"]]);
  g.phase = "between";
  g.turn = "1";
  g.deadline = 123;
  const out = take(g, "0");
  assert.equal(out.turn, "0");
  assert.equal(out.deadline, 123);
  assert.equal(out.players[1].escaped, true);
  assert.deepEqual(out.players[0].hand, ["AH", "2H"]);
});
test("seeded complete games preserve all cards and replay deterministically", () => {
  for (let n = 3; n <= 8; n++) {
    for (let s = 1; s <= 12; s++) {
      const random = seed(s);
      let g = createGame(seats.slice(0, n), random),
        moves = 0;
      while (g.phase !== "finished" && moves++ < 12000) {
        g =
          g.phase === "between"
            ? begin(g)
            : play(
                g,
                g.turn,
                botCard({ choices: legal(g, g.turn), lead: g.pile[0]?.card }),
                random,
              );
        const cards = [
          ...g.players.flatMap((p) => p.hand),
          ...g.waste,
          ...g.pile.map((p) => p.card),
        ];
        assert.equal(cards.length, 52);
        assert.equal(new Set(cards).size, 52);
      }
      assert.equal(g.phase, "finished", `players ${n}, seed ${s}`);
      assert.ok(g.loser);
    }
  }
});

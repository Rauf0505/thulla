export type Card = string;
export type Player = {
  id: string;
  name: string;
  hand: Card[];
  escaped: boolean;
};
export type Game = {
  players: Player[];
  turn: string;
  phase: "playing" | "between" | "finished";
  opening: boolean;
  trickNumber: number;
  pile: { player: string; card: Card }[];
  participants: string[];
  waste: Card[];
  drawn: boolean;
  forced: string | null;
  loser: string | null;
  message: string;
  deadline: number;
};
export const suit = (c: Card) => c.slice(-1);
export const rank = (c: Card) =>
  ({ J: 11, Q: 12, K: 13, A: 14 })[c.slice(0, -1)] || Number(c.slice(0, -1));
export function deck() {
  return ["S", "H", "C", "D"].flatMap((s) =>
    ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].map(
      (r) => r + s,
    ),
  );
}
export function createGame(
  seats: { id: string; name: string }[],
  random: () => number = Math.random,
  dealer = 0,
): Game {
  if (seats.length < 3 || seats.length > 8)
    throw Error("A table needs 3–8 players.");
  const cards = deck();
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const players = seats.map((p) => ({
    ...p,
    hand: [] as Card[],
    escaped: false,
  }));
  cards.forEach((c, i) =>
    players[(i + dealer + 1) % players.length].hand.push(c),
  );
  const turn = players.find((p) => p.hand.includes("AS"))!.id;
  return {
    players,
    turn,
    phase: "playing",
    opening: true,
    trickNumber: 1,
    pile: [],
    participants: players.map((p) => p.id),
    waste: [],
    drawn: false,
    forced: "AS",
    loser: null,
    message: "Ace of Spades opens. The first trick is always discarded.",
    deadline: Date.now() + 30000,
  };
}
export function legal(g: Game, id: string): Card[] {
  const p = g.players.find((p) => p.id === id);
  if (!p || g.phase !== "playing" || g.turn !== id) return [];
  if (g.forced) return p.hand.includes(g.forced) ? [g.forced] : [];
  const s = g.pile[0] && suit(g.pile[0].card);
  const following = p.hand.filter((c) => suit(c) === s);
  return following.length ? following : p.hand;
}
function next(g: Game, id: string, eligible: (p: Player) => boolean) {
  const i = g.players.findIndex((p) => p.id === id);
  for (let n = 1; n <= g.players.length; n++) {
    const p = g.players[(i + n) % g.players.length];
    if (eligible(p)) return p.id;
  }
  throw Error("No eligible player.");
}
function finish(g: Game, id: string) {
  g.loser = id;
  g.phase = "finished";
  g.message = `${g.players.find((p) => p.id === id)!.name} is the last player.`;
  g.forced = null;
}
export function play(
  input: Game,
  id: string,
  card: Card,
  random: () => number = Math.random,
): Game {
  if (!legal(input, id).includes(card))
    throw Error("That card is not legal. Follow suit and wait for your turn.");
  const g = structuredClone(input),
    p = g.players.find((p) => p.id === id)!;
  p.hand.splice(p.hand.indexOf(card), 1);
  g.forced = null;
  g.pile.push({ player: id, card });
  const lead = suit(g.pile[0].card),
    thulla = !g.opening && suit(card) !== lead;
  if (!thulla && g.pile.length < g.participants.length) {
    g.turn = next(
      g,
      id,
      (p) =>
        g.participants.includes(p.id) && !g.pile.some((c) => c.player === p.id),
    );
    g.deadline = Date.now() + 30000;
    return g;
  }
  const high = g.pile
      .filter((c) => suit(c.card) === lead)
      .reduce((a, b) => (rank(a.card) > rank(b.card) ? a : b)),
    winner = g.players.find((p) => p.id === high.player)!;
  const activeBefore = g.players.filter((p) => !p.escaped);
  if (thulla) {
    winner.hand.push(...g.pile.map((c) => c.card));
    g.message = `Thulla! ${winner.name} picks up ${g.pile.length} cards.`;
  } else g.message = `${winner.name} has the lead. Trick discarded.`;
  // A drawn lead beaten by a Thulla is the documented two-player shortcut.
  if (activeBefore.length === 2 && g.drawn && thulla) {
    g.pile = [];
    finish(g, winner.id);
    return g;
  }
  for (const player of g.players) {
    if (!player.hand.length && (thulla || player.id !== winner.id))
      player.escaped = true;
  }
  const remaining = g.players.filter((p) => !p.escaped);
  if (remaining.length === 1) {
    if (!thulla) g.waste.push(...g.pile.map((c) => c.card));
    g.pile = [];
    finish(g, remaining[0].id);
    return g;
  }
  g.drawn = false;
  if (!winner.hand.length) {
    if (!g.waste.length)
      throw Error("Invariant failure: no previous waste card available.");
    const index = Math.floor(random() * g.waste.length);
    const [draw] = g.waste.splice(index, 1);
    winner.hand.push(draw);
    g.forced = draw;
    g.drawn = true;
  }
  if (!thulla) g.waste.push(...g.pile.map((c) => c.card));
  g.pile = [];
  g.turn = winner.id;
  g.opening = false;
  g.trickNumber++;
  g.phase = "between";
  g.participants = remaining.map((p) => p.id);
  g.deadline = Date.now() + 5000;
  return g;
}
export function begin(input: Game): Game {
  if (input.phase !== "between") throw Error("Not between tricks.");
  const g = structuredClone(input);
  g.phase = "playing";
  g.participants = g.players.filter((p) => !p.escaped).map((p) => p.id);
  g.deadline = Date.now() + 30000;
  return g;
}
export function take(input: Game, id: string): Game {
  if (input.phase !== "between")
    throw Error("Take a hand only between tricks.");
  const g = structuredClone(input),
    p = g.players.find((p) => p.id === id);
  if (!p || p.escaped) throw Error("You have already got away.");
  const target = g.players.find(
    (p) => p.id === next(g, id, (p) => !p.escaped),
  )!;
  p.hand.push(...target.hand);
  target.hand = [];
  target.escaped = true;
  if (g.turn === target.id) {
    g.turn = id;
  }
  if (g.players.filter((p) => !p.escaped).length === 1) finish(g, id);
  g.message = `${p.name} took ${target.name}’s hand.`;
  g.participants = g.players.filter((p) => !p.escaped).map((p) => p.id);
  return g;
}

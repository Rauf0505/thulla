import next from "next";
import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { begin, createGame, Game, legal, play, take } from "./src/engine";
import { botCard } from "./src/bot";
import type { Command, View } from "./src/protocol";
import { authenticatedUser, AuthUser } from "./src/server-auth";
import { bootstrapAdmins, db, migrateRooms } from "./src/db";

type Seat = {
  id: string;
  userId: string | null;
  name: string;
  bot: boolean;
  ready: boolean;
};
type Room = {
  code: string;
  host: string;
  version: number;
  players: Seat[];
  game: Game | null;
  seen: string[];
  dealer: number;
  matchId?: string;
  resultsRecorded?: boolean;
};
type Client = { user?: AuthUser; room?: string; last: number; burst: number };
const rooms = new Map<string, Room>(),
  clients = new Map<WebSocket, Client>();
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32,
  sql = db;
const stateOf = (r: Room) =>
  r.game?.phase === "finished" ? "finished" : r.game ? "playing" : "waiting";
const connected = (userId: string | null) =>
  !!userId && [...clients.values()].some((c) => c.user?.id === userId);
async function profileFor(userId: string) {
  const rows =
    (await sql()`select status,display_name from public.profiles where id=${userId}`) as unknown as {
      status: string;
      display_name: string;
    }[];
  if (rows[0]?.status !== "active")
    throw Error(
      "This account is unavailable. Contact support if you need help.",
    );
  return rows[0].display_name;
}
async function persist(r: Room, action: string, actor?: string) {
  const shouldRecord = r.game?.phase === "finished" && !r.resultsRecorded;
  await sql().begin(async (tx) => {
    const hostUserId = r.players.find((p) => p.id === r.host)?.userId ?? null;
    await tx`insert into public.rooms(code,host_user_id,version,dealer,snapshot,state) values(${r.code},${hostUserId},${r.version},${r.dealer},${tx.json(r)},${stateOf(r)}) on conflict(code) do update set host_user_id=excluded.host_user_id,version=excluded.version,dealer=excluded.dealer,snapshot=excluded.snapshot,state=excluded.state,updated_at=now()`;
    await tx`insert into public.room_events(room_code,version,command_id,actor_user_id,action) values(${r.code},${r.version},${r.seen.at(-1) ?? null},${actor ?? null},${action}) on conflict(room_code,command_id) do nothing`;
    if (action === "start" || action === "rematch") {
      await tx`insert into public.matches(id,room_code,status) values(${r.matchId!},${r.code},'playing') on conflict do nothing`;
      for (const [seat, player] of r.players.entries())
        await tx`insert into public.match_players(match_id,user_id,display_name,seat,is_bot) values(${r.matchId!},${player.userId},${player.name},${seat},${player.bot}) on conflict do nothing`;
    }
    if (shouldRecord) {
      const game = r.game!,
        botMatch = r.players.some((p) => p.bot);
      await tx`update public.matches set status='finished',ended_at=now(),loser_user_id=${r.players.find((p) => p.id === game.loser)?.userId ?? null},final_snapshot=${tx.json(game)} where id=${r.matchId!}`;
      for (const [seat, p] of r.players.entries()) {
        const gp = game.players.find((x) => x.id === p.id);
        if (!gp) continue;
        const lost = p.id === game.loser,
          result = lost ? "lost" : gp.escaped ? "escaped" : "won";
        await tx`update public.match_players set result=${result},escaped=${gp.escaped},final_card_count=${gp.hand.length} where match_id=${r.matchId!} and seat=${seat}`;
        if (p.userId) {
          await tx`insert into public.player_stat_ledger(user_id,match_id,wins_delta,losses_delta,matches_delta,bot_matches_delta,reason) values(${p.userId},${r.matchId!},${lost ? 0 : 1},${lost ? 1 : 0},1,${botMatch ? 1 : 0},'match_result')`;
          await tx`insert into public.player_stats(user_id,matches,wins,losses,bot_matches,last_played_at) values(${p.userId},1,${lost ? 0 : 1},${lost ? 1 : 0},${botMatch ? 1 : 0},now()) on conflict(user_id) do update set matches=player_stats.matches+1,wins=player_stats.wins+excluded.wins,losses=player_stats.losses+excluded.losses,bot_matches=player_stats.bot_matches+excluded.bot_matches,last_played_at=now(),updated_at=now()`;
        }
      }
    }
  });
  if (shouldRecord) r.resultsRecorded = true;
  rooms.set(r.code, r);
}
function view(r: Room, userId: string): View {
  const seat = r.players.find((p) => p.userId === userId)!;
  const g = r.game;
  return {
    code: r.code,
    version: r.version,
    you: seat.id,
    host: r.host,
    players: r.players.map((p) => {
      const gp = g?.players.find((x) => x.id === p.id);
      return {
        id: p.id,
        name: p.name,
        bot: p.bot,
        ready: p.ready,
        connected: !p.bot && connected(p.userId),
        count: gp?.hand.length || 0,
        escaped: gp?.escaped || false,
      };
    }),
    hand: g?.players.find((p) => p.id === seat.id)?.hand || [],
    legal: g ? legal(g, seat.id) : [],
    game: g
      ? {
          turn: g.turn,
          phase: g.phase,
          opening: g.opening,
          trickNumber: g.trickNumber,
          pile: g.pile,
          loser: g.loser,
          message: g.message,
          deadline: g.deadline,
        }
      : null,
  };
}
function broadcast(r: Room) {
  for (const [ws, c] of clients)
    if (c.room === r.code && c.user && ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "state", view: view(r, c.user.id) }));
}
async function authenticate(c: Client, token: unknown) {
  if (typeof token !== "string" || token.length < 30)
    throw Error("Sign in is required.");
  const u = await authenticatedUser(token);
  u.name = await profileFor(u.id);
  if (c.user && c.user.id !== u.id) throw Error("Session mismatch.");
  c.user = u;
  return u;
}

if (process.argv.includes("--production"))
  Object.assign(process.env, { NODE_ENV: "production" });
const app = next({
  dev:
    process.env.NODE_ENV !== "production" &&
    !process.argv.includes("--production"),
});
const handle = app.getRequestHandler();
async function main() {
  await bootstrapAdmins();
  for (const row of await migrateRooms()) {
    const r = row.snapshot as Room;
    if (r.game && r.game.phase !== "finished")
      r.game.deadline = Date.now() + 30000;
    rooms.set(r.code, r);
  }
  await app.prepare();
  const server = createServer((req, res) => {
    if (req.url === "/api/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, database: "postgres" }));
      return;
    }
    handle(req, res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on("upgrade", (req, socket, head) => {
    if (req.url?.split("?")[0] !== "/ws") {
      app.getUpgradeHandler()(req, socket, head);
      return;
    }
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (ws) => {
    clients.set(ws, { last: Date.now(), burst: 0 });
    ws.on("message", async (raw) => {
      try {
        const c = clients.get(ws)!;
        if (Date.now() - c.last > 1000) {
          c.last = Date.now();
          c.burst = 0;
        }
        if (++c.burst > 20) throw Error("Too many requests.");
        const m = JSON.parse(raw.toString()) as Command,
          u = await authenticate(c, m.token);
        if (m.type === "resume") {
          const existing = [...rooms.values()].find((r) =>
            r.players.some((p) => p.userId === u.id),
          );
          if (existing) {
            c.room = existing.code;
            broadcast(existing);
          }
          return;
        }
        if (m.type === "create" || m.type === "join") {
          if (c.room) throw Error("You already have a table.");
          const prior = [...rooms.values()].find((r) =>
            r.players.some((p) => p.userId === u.id),
          );
          if (prior) {
            c.room = prior.code;
            broadcast(prior);
            return;
          }
          const seat: Seat = {
            id: randomUUID(),
            userId: u.id,
            name: u.name,
            bot: false,
            ready: false,
          };
          let r: Room;
          if (m.type === "create") {
            let code = "";
            do {
              code = Array.from(
                { length: 6 },
                () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
              ).join("");
            } while (rooms.has(code));
            r = {
              code,
              host: seat.id,
              version: 1,
              players: [seat],
              game: null,
              seen: [],
              dealer: 0,
            };
          } else {
            const old = rooms.get(String(m.code).toUpperCase());
            if (!old) throw Error("That table was not found.");
            r = structuredClone(old);
            if (r.game || r.players.length >= 8)
              throw Error("That table is full or already playing.");
            r.players.push(seat);
            r.version++;
          }
          await persist(r, m.type, u.id);
          c.room = r.code;
          broadcast(r);
          return;
        }
        const old = rooms.get(c.room || "");
        if (!old) throw Error("Join a table first.");
        if (typeof m.id !== "string" || m.id.length > 100)
          throw Error("Missing command ID.");
        if (old.seen.includes(m.id)) {
          broadcast(old);
          return;
        }
        if (m.version !== old.version)
          throw Error("Table updated. Please try again.");
        const r = structuredClone(old),
          seat = r.players.find((p) => p.userId === u.id)!;
        const host = () => {
          if (r.host !== seat.id) throw Error("Only the host can do that.");
        };
        switch (m.type) {
          case "leave": {
            const other = r.players.find((p) => !p.bot && p.id !== seat.id);
            if (r.game && r.game.phase !== "finished") {
              seat.bot = true;
              seat.userId = null;
              seat.ready = true;
            } else {
              r.players = r.players.filter((p) => p.id !== seat.id);
              r.game = null;
            }
            if (r.host === seat.id)
              r.host = other?.id || r.players[0]?.id || "";
            r.version++;
            r.seen.push(m.id);
            await persist(r, "leave", u.id);
            c.room = undefined;
            ws.send(JSON.stringify({ type: "left" }));
            broadcast(r);
            return;
          }
          case "ready":
            if (r.game) throw Error("The game has started.");
            seat.ready = !seat.ready;
            break;
          case "addBot":
            host();
            if (r.game || r.players.length >= 8) throw Error("No free seats.");
            r.players.push({
              id: randomUUID(),
              userId: null,
              name: `Bot ${r.players.filter((p) => p.bot).length + 1}`,
              bot: true,
              ready: true,
            });
            break;
          case "removeBot":
            host();
            if (r.game) throw Error("The game has started.");
            r.players = r.players.filter((p) => p.id !== m.player || !p.bot);
            break;
          case "start":
          case "rematch":
            host();
            if (
              m.type === "start" &&
              (r.game || r.players.some((p) => !p.ready))
            )
              throw Error("Everyone must be ready.");
            if (m.type === "rematch" && r.game?.phase !== "finished")
              throw Error("Finish this round first.");
            r.game = createGame(r.players, rng, r.dealer++);
            r.matchId = randomUUID();
            r.resultsRecorded = false;
            break;
          case "play":
            if (!r.game || typeof m.card !== "string")
              throw Error("No active game.");
            r.game = play(r.game, seat.id, m.card, rng);
            break;
          case "take":
            if (!r.game) throw Error("No active game.");
            r.game = take(r.game, seat.id);
            break;
          default:
            throw Error("Unknown command.");
        }
        r.version++;
        r.seen.push(m.id);
        await persist(r, m.type, u.id);
        broadcast(r);
      } catch (e) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: e instanceof Error ? e.message : "Request failed.",
          }),
        );
      }
    });
    ws.on("close", () => {
      const r = rooms.get(clients.get(ws)?.room || "");
      clients.delete(ws);
      if (r) broadcast(r);
    });
  });
  setInterval(async () => {
    for (const old of rooms.values()) {
      const g = old.game;
      if (!g || g.phase === "finished") continue;
      const p = old.players.find((p) => p.id === g.turn)!;
      const due =
        g.phase === "between"
          ? Date.now() >= g.deadline
          : Date.now() >= g.deadline ||
            ((p.bot || !connected(p.userId)) &&
              Date.now() >= g.deadline - 28500);
      if (!due) continue;
      try {
        const r = structuredClone(old);
        r.game =
          g.phase === "between"
            ? begin(g)
            : play(
                g,
                g.turn,
                botCard({ choices: legal(g, g.turn), lead: g.pile[0]?.card }),
                rng,
              );
        r.version++;
        await persist(r, "automatic");
        broadcast(r);
      } catch (e) {
        console.error("Room transition failed", old.code, e);
      }
    }
  }, 500).unref();
  server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
    console.log(
      "Thulla ready on http://localhost:" + (process.env.PORT || 3000),
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

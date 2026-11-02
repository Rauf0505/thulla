import { randomInt, randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import {
  begin as beginTrick,
  createGame,
  Game,
  legal,
  play,
  take,
} from "./engine";
import { botCard } from "./bot";
import type { Command, View } from "./protocol";
import { db } from "./db";
import { notifyRoom } from "./realtime";

export type Seat = {
  id: string;
  userId: string | null;
  name: string;
  bot: boolean;
  ready: boolean;
};
export type Room = {
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

const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;
const PRESENCE_SECONDS = 25;
const PRESENCE_WRITE_SECONDS = 10;
const MAX_SEEN = 100;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED = new Set([
  "resume",
  "create",
  "join",
  "leave",
  "ready",
  "addBot",
  "removeBot",
  "start",
  "play",
  "take",
  "rematch",
]);

export const stateOf = (room: Room) =>
  room.game?.phase === "finished"
    ? "finished"
    : room.game
      ? "playing"
      : "waiting";

export async function profileFor(userId: string) {
  const rows =
    (await db()`select status,display_name from public.profiles where id=${userId}`) as unknown as {
      status: string;
      display_name: string;
    }[];
  if (rows[0]?.status !== "active")
    throw Error(
      "This account is unavailable. Contact support if you need help.",
    );
  return rows[0].display_name;
}

function view(room: Room, userId: string, online: Set<string>): View {
  const seat = room.players.find((player) => player.userId === userId);
  if (!seat) throw Error("You are not at this table.");
  const game = room.game;
  return {
    code: room.code,
    version: room.version,
    you: seat.id,
    host: room.host,
    players: room.players.map((player) => {
      const seated = game?.players.find((x) => x.id === player.id);
      return {
        id: player.id,
        name: player.name,
        bot: player.bot,
        ready: player.ready,
        connected: !player.bot && online.has(player.id),
        count: seated?.hand.length || 0,
        escaped: seated?.escaped || false,
      };
    }),
    hand: game?.players.find((player) => player.id === seat.id)?.hand || [],
    legal: game ? legal(game, seat.id) : [],
    game: game
      ? {
          turn: game.turn,
          phase: game.phase,
          opening: game.opening,
          trickNumber: game.trickNumber,
          pile: game.pile,
          loser: game.loser,
          message: game.message,
          deadline: game.deadline,
        }
      : null,
  };
}

async function write(
  tx: TransactionSql,
  room: Room,
  action: string,
  actor?: string,
) {
  const shouldRecord =
    room.game?.phase === "finished" && !room.resultsRecorded && !!room.matchId;
  // Persist the flag in the same snapshot that records the result. Otherwise a
  // later request would load the finished game and count the match again.
  if (shouldRecord) room.resultsRecorded = true;
  const hostUserId =
    room.players.find((player) => player.id === room.host)?.userId ?? null;
  await tx`insert into public.rooms(code,host_user_id,version,dealer,snapshot,state) values(${room.code},${hostUserId},${room.version},${room.dealer},${tx.json(room)},${stateOf(room)}) on conflict(code) do update set host_user_id=excluded.host_user_id,version=excluded.version,dealer=excluded.dealer,snapshot=excluded.snapshot,state=excluded.state,updated_at=now()`;
  const commandId = action === "automatic" ? null : (room.seen.at(-1) ?? null);
  await tx`insert into public.room_events(room_code,version,command_id,actor_user_id,action) values(${room.code},${room.version},${commandId},${actor ?? null},${action}) on conflict do nothing`;
  if (action === "start" || action === "rematch") {
    await tx`insert into public.matches(id,room_code,status) values(${room.matchId!},${room.code},'playing') on conflict do nothing`;
    for (const [seat, player] of room.players.entries())
      await tx`insert into public.match_players(match_id,user_id,display_name,seat,is_bot) values(${room.matchId!},${player.userId},${player.name},${seat},${player.bot}) on conflict do nothing`;
  }
  if (shouldRecord) {
    const game = room.game!;
    const botMatch = room.players.some((player) => player.bot);
    await tx`update public.matches set status='finished',ended_at=now(),loser_user_id=${room.players.find((player) => player.id === game.loser)?.userId ?? null},final_snapshot=${tx.json(game)} where id=${room.matchId!}`;
    for (const [seat, player] of room.players.entries()) {
      const seated = game.players.find((x) => x.id === player.id);
      if (!seated) continue;
      const lost = player.id === game.loser;
      const result = lost ? "lost" : seated.escaped ? "escaped" : "won";
      await tx`update public.match_players set result=${result},escaped=${seated.escaped},final_card_count=${seated.hand.length} where match_id=${room.matchId!} and seat=${seat}`;
      if (player.userId) {
        await tx`insert into public.player_stat_ledger(user_id,match_id,wins_delta,losses_delta,matches_delta,bot_matches_delta,reason) values(${player.userId},${room.matchId!},${lost ? 0 : 1},${lost ? 1 : 0},1,${botMatch ? 1 : 0},'match_result')`;
        await tx`insert into public.player_stats(user_id,matches,wins,losses,bot_matches,last_played_at) values(${player.userId},1,${lost ? 0 : 1},${lost ? 1 : 0},${botMatch ? 1 : 0},now()) on conflict(user_id) do update set matches=player_stats.matches+1,wins=player_stats.wins+excluded.wins,losses=player_stats.losses+excluded.losses,bot_matches=player_stats.bot_matches+excluded.bot_matches,last_played_at=now(),updated_at=now()`;
      }
    }
  }
}

async function loadForUpdate(tx: TransactionSql, code: string) {
  const rows =
    (await tx`select snapshot from public.rooms where code=${code} for update`) as unknown as {
      snapshot: Room;
    }[];
  return rows[0]?.snapshot ?? null;
}

async function findRoomForUserTx(tx: TransactionSql, userId: string) {
  const rows = (await tx`
    select code from public.rooms
    where state in ('waiting','playing','finished')
      and exists (
        select 1 from jsonb_array_elements(snapshot->'players') player
        where player->>'userId' = ${userId}
      )
    order by case state when 'playing' then 0 when 'waiting' then 1 else 2 end, updated_at desc
    limit 1`) as unknown as { code: string }[];
  return rows[0]?.code ?? null;
}

export async function findRoomForUser(userId: string) {
  const rows = (await db()`
    select code from public.rooms
    where state in ('waiting','playing','finished')
      and exists (
        select 1 from jsonb_array_elements(snapshot->'players') player
        where player->>'userId' = ${userId}
      )
    order by case state when 'playing' then 0 when 'waiting' then 1 else 2 end, updated_at desc
    limit 1`) as unknown as { code: string }[];
  return rows[0]?.code ?? null;
}

async function touch(tx: TransactionSql, room: Room, seat: Seat) {
  await tx`insert into public.room_presence(room_code,seat_id,user_id,last_seen) values(${room.code},${seat.id},${seat.userId},now()) on conflict(room_code,seat_id) do update set last_seen=now(),user_id=excluded.user_id where room_presence.last_seen < now() - make_interval(secs => ${PRESENCE_WRITE_SECONDS})`;
}

async function onlineSeats(tx: TransactionSql, code: string) {
  const rows =
    (await tx`select seat_id from public.room_presence where room_code=${code} and last_seen > now() - make_interval(secs => ${PRESENCE_SECONDS})`) as unknown as {
      seat_id: string;
    }[];
  return new Set(rows.map((row) => row.seat_id));
}

/**
 * Advances expired turns and plays for bots/away players. Safe to call from any
 * instance: the caller holds a row lock on the room.
 */
function advance(room: Room, now: number, online: Set<string>) {
  let changed = false;
  for (let step = 0; step < 100; step++) {
    const game = room.game;
    if (!game || game.phase === "finished") break;
    if (game.phase === "between") {
      if (now < game.deadline) break;
      try {
        room.game = beginTrick(game);
        changed = true;
      } catch (error) {
        console.error("Trick advance failed", room.code, error);
        break;
      }
      continue;
    }
    const player = room.players.find((p) => p.id === game.turn);
    if (!player) break;
    const due = player.bot
      ? true
      : online.has(player.id)
        ? now >= game.deadline
        : now >= game.deadline - 28_500;
    if (!due) break;
    try {
      room.game = play(
        game,
        game.turn,
        botCard({ choices: legal(game, game.turn), lead: game.pile[0]?.card }),
        rng,
      );
      changed = true;
    } catch (error) {
      console.error("Automatic move failed", room.code, error);
      break;
    }
  }
  return changed;
}

function randomCode() {
  return Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
  ).join("");
}

function makeSeat(userId: string, name: string): Seat {
  return { id: randomUUID(), userId, name, bot: false, ready: false };
}

async function createRoom(tx: TransactionSql, userId: string, name: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode();
    const seat = makeSeat(userId, name);
    const room: Room = {
      code,
      host: seat.id,
      version: 1,
      players: [seat],
      game: null,
      seen: [],
      dealer: 0,
    };
    const rows =
      (await tx`insert into public.rooms(code,host_user_id,version,dealer,snapshot,state) values(${code},${userId},1,0,${tx.json(room)},'waiting') on conflict(code) do nothing returning code`) as unknown as {
        code: string;
      }[];
    if (rows.length) {
      await write(tx, room, "create", userId);
      return room;
    }
  }
  throw Error("Could not create a table. Please try again.");
}

export type ViewResult = {
  view: View | null;
  changed: boolean;
  code?: string;
};

export async function getView(
  userId: string,
  code?: string,
): Promise<ViewResult> {
  const target =
    String(code || "")
      .trim()
      .toUpperCase() || (await findRoomForUser(userId));
  if (!target) return { view: null, changed: false };
  const outcome = await db().begin(async (tx) => {
    const room = await loadForUpdate(tx, target);
    if (!room) return { view: null, changed: false, code: target };
    const seat = room.players.find((player) => player.userId === userId);
    if (!seat) return { view: null, changed: false, code: target };
    await touch(tx, room, seat);
    const online = await onlineSeats(tx, room.code);
    online.add(seat.id);
    const changed = advance(room, Date.now(), online);
    if (changed) {
      room.version++;
      await write(tx, room, "automatic");
    }
    return { view: view(room, userId, online), changed, code: room.code };
  });
  if (outcome.changed && outcome.code) await notifyRoom(outcome.code);
  return outcome;
}

export type CommandResult = {
  view?: View;
  left?: boolean;
  error?: string;
  changed: boolean;
  code?: string;
};

export async function runCommand(
  userId: string,
  name: string,
  command: Command,
): Promise<CommandResult> {
  const m = command;
  if (!m || typeof m !== "object" || !ALLOWED.has(m.type))
    throw Error("Unknown command.");
  if (m.type === "resume") {
    const result = await getView(userId, m.code);
    return {
      view: result.view ?? undefined,
      changed: result.changed,
      code: result.code,
    };
  }

  if (m.type === "create" || m.type === "join") {
    const outcome = await db().begin(async (tx) => {
      const existing = await findRoomForUserTx(tx, userId);
      if (existing) {
        const room = await loadForUpdate(tx, existing);
        const seat = room?.players.find((player) => player.userId === userId);
        if (room && seat) {
          await touch(tx, room, seat);
          const online = await onlineSeats(tx, room.code);
          online.add(seat.id);
          const changed = advance(room, Date.now(), online);
          if (changed) {
            room.version++;
            await write(tx, room, "automatic");
          }
          return { view: view(room, userId, online), changed, code: room.code };
        }
      }
      if (m.type === "create") {
        const room = await createRoom(tx, userId, name);
        await touch(tx, room, room.players[0]);
        const online = await onlineSeats(tx, room.code);
        online.add(room.players[0].id);
        return {
          view: view(room, userId, online),
          changed: true,
          code: room.code,
        };
      }
      const code = String(m.code || "")
        .trim()
        .toUpperCase();
      if (!code) throw Error("Enter a room code.");
      const room = await loadForUpdate(tx, code);
      if (!room) throw Error("That table was not found.");
      if (room.game || room.players.length >= 8)
        throw Error("That table is full or already playing.");
      const seat = makeSeat(userId, name);
      room.players.push(seat);
      room.version++;
      await touch(tx, room, seat);
      await write(tx, room, "join", userId);
      const online = await onlineSeats(tx, room.code);
      online.add(seat.id);
      return {
        view: view(room, userId, online),
        changed: true,
        code: room.code,
      };
    });
    if (outcome.changed && outcome.code) await notifyRoom(outcome.code);
    return outcome;
  }

  const code =
    String(m.code || "")
      .trim()
      .toUpperCase() || (await findRoomForUser(userId));
  if (!code) throw Error("Join a table first.");
  const outcome = await db().begin(async (tx) => {
    const room = await loadForUpdate(tx, code);
    if (!room) throw Error("Join a table first.");
    const seat = room.players.find((player) => player.userId === userId);
    if (!seat) throw Error("You are not at this table.");
    await touch(tx, room, seat);
    const online = await onlineSeats(tx, room.code);
    online.add(seat.id);
    let changed = advance(room, Date.now(), online);
    if (changed) {
      room.version++;
      await write(tx, room, "automatic");
    }
    if (typeof m.id !== "string" || !UUID.test(m.id))
      throw Error("Missing command ID.");
    if (room.seen.includes(m.id))
      return {
        view: m.type === "leave" ? undefined : view(room, userId, online),
        left: m.type === "leave" ? true : undefined,
        changed,
        code: room.code,
      };
    if (m.version !== room.version)
      return {
        error: "Table updated. Please try again.",
        changed,
        code: room.code,
      };
    const host = () => {
      if (room.host !== seat.id) throw Error("Only the host can do that.");
    };
    switch (m.type) {
      case "leave": {
        const other = room.players.find(
          (player) => !player.bot && player.id !== seat.id,
        );
        if (room.game && room.game.phase !== "finished") {
          seat.bot = true;
          seat.userId = null;
          seat.ready = true;
        } else {
          room.players = room.players.filter((player) => player.id !== seat.id);
          room.game = null;
        }
        if (room.host === seat.id)
          room.host = other?.id || room.players[0]?.id || "";
        break;
      }
      case "ready":
        if (room.game) throw Error("The game has started.");
        seat.ready = !seat.ready;
        break;
      case "addBot":
        host();
        if (room.game || room.players.length >= 8)
          throw Error("No free seats.");
        room.players.push({
          id: randomUUID(),
          userId: null,
          name: `Bot ${room.players.filter((player) => player.bot).length + 1}`,
          bot: true,
          ready: true,
        });
        break;
      case "removeBot":
        host();
        if (room.game) throw Error("The game has started.");
        room.players = room.players.filter(
          (player) => player.id !== m.player || !player.bot,
        );
        break;
      case "start":
      case "rematch":
        host();
        if (
          m.type === "start" &&
          (room.game || room.players.some((player) => !player.ready))
        )
          throw Error("Everyone must be ready.");
        if (m.type === "rematch" && room.game?.phase !== "finished")
          throw Error("Finish this round first.");
        room.game = createGame(room.players, rng, room.dealer++);
        room.matchId = randomUUID();
        room.resultsRecorded = false;
        break;
      case "play":
        if (!room.game || typeof m.card !== "string")
          throw Error("No active game.");
        room.game = play(room.game, seat.id, m.card, rng);
        break;
      case "take":
        if (!room.game) throw Error("No active game.");
        room.game = take(room.game, seat.id);
        break;
      default:
        throw Error("Unknown command.");
    }
    room.version++;
    room.seen.push(m.id);
    if (room.seen.length > MAX_SEEN) room.seen = room.seen.slice(-MAX_SEEN);
    await write(tx, room, m.type, userId);
    if (m.type === "leave") {
      await tx`delete from public.room_presence where room_code=${room.code} and seat_id=${seat.id}`;
      return { left: true, changed: true, code: room.code };
    }
    if (advance(room, Date.now(), online)) {
      room.version++;
      await write(tx, room, "automatic");
    }
    return { view: view(room, userId, online), changed: true, code: room.code };
  });
  if (outcome.changed && outcome.code) await notifyRoom(outcome.code);
  return outcome;
}

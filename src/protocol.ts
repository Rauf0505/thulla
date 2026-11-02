export type View = {
  code: string;
  version: number;
  you: string;
  host: string;
  players: {
    id: string;
    name: string;
    bot: boolean;
    ready: boolean;
    connected: boolean;
    count: number;
    escaped: boolean;
  }[];
  hand: string[];
  legal: string[];
  game: null | {
    turn: string;
    phase: "playing" | "between" | "finished";
    opening: boolean;
    trickNumber: number;
    pile: { player: string; card: string }[];
    loser: string | null;
    message: string;
    deadline: number;
  };
};
export type Command = {
  type:
    | "resume"
    | "create"
    | "join"
    | "leave"
    | "ready"
    | "addBot"
    | "removeBot"
    | "start"
    | "play"
    | "take"
    | "rematch";
  token?: string;
  id?: string;
  version?: number;
  name?: string;
  code?: string;
  card?: string;
  player?: string;
};

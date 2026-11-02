"use client";
import { useEffect, useRef, useState } from "react";
import type { View } from "../src/protocol";
import { browserId } from "../src/browser-id";
import { supabase } from "../src/supabase-browser";
import type { User } from "@supabase/supabase-js";
const requestSignal = () =>
  typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(8000)
    : undefined;
const symbols: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
function Card({
  card,
  selected,
  onClick,
  disabled = false,
}: {
  card: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const suit = card.slice(-1),
    rank = card.slice(0, -1);
  return (
    <button
      className={`card ${suit === "H" || suit === "D" ? "red" : ""} ${selected ? "selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${rank} of ${{ S: "spades", H: "hearts", D: "diamonds", C: "clubs" }[suit]}`}
      aria-pressed={onClick ? !!selected : undefined}
    >
      <span>
        {rank}
        <small>{symbols[suit]}</small>
      </span>
      <strong>{symbols[suit]}</strong>
      <span className="corner">
        {rank}
        <small>{symbols[suit]}</small>
      </span>
    </button>
  );
}
export default function Home() {
  const [view, setView] = useState<View | null>(null),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Connecting"),
    [selected, setSelected] = useState(""),
    [rules, setRules] = useState(false),
    [inviteLink, setInviteLink] = useState(""),
    [user, setUser] = useState<User | null>(null),
    [accessToken, setAccessToken] = useState(""),
    [authReady, setAuthReady] = useState(false),
    [now, setNow] = useState(Date.now());
  const viewRef = useRef<View | null>(null),
    token = useRef(""),
    refreshRef = useRef<() => void>(() => {}),
    syncRef = useRef<() => void>(() => {}),
    pendingRef = useRef(0);
  useEffect(() => {
    if (!rules) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const controls = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>('button,a,input,[tabindex="0"]'),
      );
    controls()[0]?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") setRules(false);
      if (e.key === "Tab") {
        const items = controls(),
          first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keys);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [rules]);
  useEffect(() => {
    const auth = supabase;
    if (!auth) {
      setAuthReady(true);
      return;
    }
    const clear = () => {
      viewRef.current = null;
      setView(null);
      setSelected("");
      setError("");
    };
    const update = async () => {
      const {
        data: { session },
      } = await auth.auth.getSession();
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? "");
      if (!session) clear();
      setAuthReady(true);
    };
    update();
    const {
      data: { subscription },
    } = auth.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? "");
      if (!session) clear();
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const auth = supabase;
    if (!auth || !accessToken) return;
    const client = auth;
    token.current = accessToken;
    setName(
      String(user?.user_metadata.full_name || user?.user_metadata.name || ""),
    );
    setCode(new URLSearchParams(location.search).get("room") || "");
    let stopped = false,
      inFlight = false,
      again = false,
      channelCode = "",
      tick: ReturnType<typeof setTimeout> | undefined,
      channel: ReturnType<typeof auth.channel> | null = null;

    function setRoomChannel(code?: string) {
      if ((code || "") === channelCode) return;
      if (channel) void client.removeChannel(channel);
      channel = null;
      channelCode = code || "";
      if (!code) return;
      channel = client
        .channel(`room:${code}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "update" }, () => {
          if (document.visibilityState === "visible") void refresh();
        })
        .subscribe();
    }

    function scheduleTick() {
      if (tick) clearTimeout(tick);
      const game = viewRef.current?.game;
      if (!game || game.phase === "finished") return;
      tick = setTimeout(
        () => {
          if (document.visibilityState === "visible") void refresh();
        },
        Math.max(250, game.deadline - Date.now() + 250),
      );
    }

    function apply(next: View | null) {
      const previous = viewRef.current;
      if (
        next &&
        previous &&
        next.code === previous.code &&
        next.version < previous.version
      )
        return;
      if (!next && previous && pendingRef.current > 0) return;
      viewRef.current = next;
      setView(next);
      setRoomChannel(next?.code);
      if (!previous || !next || previous.version !== next.version) {
        setSelected("");
        setError("");
      }
      scheduleTick();
    }

    async function refresh() {
      if (stopped) return;
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      again = false;
      try {
        const code = viewRef.current?.code;
        const response = await fetch(
          `/api/game/state${code ? `?code=${encodeURIComponent(code)}` : ""}`,
          {
            headers: { Authorization: `Bearer ${token.current}` },
            cache: "no-store",
            signal: requestSignal(),
          },
        );
        if (stopped) return;
        const data = (await response.json()) as {
          view?: View | null;
          error?: string;
        };
        if (!response.ok) {
          setStatus("Reconnecting");
          setError(data.error || "Request failed.");
          return;
        }
        if ((viewRef.current?.code || "") !== (code || "")) return;
        setStatus("Connected");
        apply(data.view ?? null);
      } catch {
        if (stopped) return;
        setStatus("Reconnecting");
      } finally {
        inFlight = false;
        if (again && !stopped) void refresh();
      }
    }

    refreshRef.current = () => void refresh();
    syncRef.current = () => apply(viewRef.current);
    void refresh();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10_000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    const clock = setInterval(() => setNow(Date.now()), 500);
    if (window.isSecureContext && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      stopped = true;
      refreshRef.current = () => {};
      syncRef.current = () => {};
      if (tick) clearTimeout(tick);
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", visible);
      if (channel) void client.removeChannel(channel);
    };
  }, [accessToken, user]);
  async function send(type: string, extra: Record<string, unknown> = {}) {
    if (!token.current) {
      setError("Sign in to play.");
      return;
    }
    pendingRef.current++;
    try {
      const response = await fetch("/api/game/command", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.current}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          id: browserId(),
          version: viewRef.current?.version,
          code: viewRef.current?.code,
          ...extra,
        }),
        signal: requestSignal(),
      });
      const data = (await response.json()) as {
        view?: View;
        left?: boolean;
        error?: string;
      };
      if (!response.ok) throw Error(data.error || "Request failed.");
      setStatus("Connected");
      if (data.left) {
        viewRef.current = null;
        setView(null);
        setSelected("");
        setError("");
      } else if (data.view) {
        viewRef.current = data.view;
        setView(data.view);
        setSelected("");
        setError("");
      }
      syncRef.current();
    } catch (error) {
      const message =
        error instanceof Error &&
        /fetch|network|abort|timeout/i.test(error.message)
          ? "Connection lost. Please try again."
          : error instanceof Error
            ? error.message
            : "Request failed.";
      setError(message);
      refreshRef.current();
    } finally {
      pendingRef.current--;
    }
  }
  const me = view?.players.find((p) => p.id === view.you),
    game = view?.game,
    turn = game?.turn === view?.you;
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ♠{" "}
          <span>
            thulla<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="connection">
          <i className={status === "Connected" ? "online" : ""} />
          {status}
        </div>
        {user && (
          <a className="leave" href="/account">
            {user.user_metadata.full_name || user.email}
          </a>
        )}
        <span>
          {view && (
            <button className="leave" onClick={() => send("leave")}>
              Leave table
            </button>
          )}
        </span>
        <button
          className="icon-button"
          onClick={() => setRules(true)}
          aria-label="How to play"
        >
          ?
        </button>
      </header>
      {!authReady ? (
        <section className="auth-card">
          <div className="eyebrow">CONNECTING YOUR ACCOUNT</div>
          <h1>One moment.</h1>
        </section>
      ) : !supabase ? (
        <section className="auth-card">
          <div className="eyebrow">CONFIGURATION REQUIRED</div>
          <h1>Set up Supabase to play.</h1>
          <p>
            Add the public Supabase URL and anonymous key to the environment,
            then reload.
          </p>
        </section>
      ) : !user ? (
        <section className="auth-card">
          <div className="eyebrow">YOUR TABLE AWAITS</div>
          <h1>Sign in to take your seat.</h1>
          <p>
            Your games, wins, losses, and account requests stay with your Google
            account.
          </p>
          <button
            className="primary"
            onClick={() =>
              supabase!.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `${location.origin}/auth/callback` },
              })
            }
          >
            Continue with Google →
          </button>
        </section>
      ) : !view ? (
        <>
          <section className="hero">
            <div className="eyebrow">GOOD CARDS. BETTER COMPANY.</div>
            <h1>
              Your people.
              <br />
              Your table.
              <br />
              <em>One last card.</em>
            </h1>
            <p>
              The classic Punjabi game of getting away.
              <br />
              Gather your friends. Leave someone holding the cards.
            </p>
            <div className="hero-cards">
              <div>
                <Card card="QS" />
              </div>
              <div>
                <Card card="AH" />
              </div>
              <div>
                <Card card="KS" />
              </div>
              <span className="spark">✦</span>
            </div>
          </section>
          <section className="entry">
            <div className="section-label">
              LET’S DEAL YOU IN <span>01 / LOBBY</span>
            </div>
            <label>
              Your table name
              <input
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                autoComplete="nickname"
              />
            </label>
            <button
              className="primary"
              onClick={() => send("create", { name })}
            >
              Create a private table <span>↗</span>
            </button>
            <div className="divider">or pull up a chair</div>
            <div className="join">
              <input
                aria-label="Room code"
                value={code}
                maxLength={6}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
              />
              <button onClick={() => send("join", { name, code })}>
                Join table →
              </button>
            </div>
            <p className="fine">
              No sign-up. No downloads. Just one more round.
            </p>
          </section>
          <section className="features">
            <div>
              <b>01</b>
              <h3>Bring your circle</h3>
              <p>Private tables for 3–8. Share a code and you’re in.</p>
            </div>
            <div>
              <b>02</b>
              <h3>Short a player?</h3>
              <p>Our bots always have a seat at the table.</p>
            </div>
            <div>
              <b>03</b>
              <h3>Get away</h3>
              <p>Follow suit. Drop a Thulla. Don’t be the last one.</p>
            </div>
          </section>
        </>
      ) : (
        <section className="room">
          <div className="room-heading">
            <div className="eyebrow">YOUR PRIVATE TABLE</div>
            <h1>{game ? "Let the cards talk." : "Good company incoming."}</h1>
            <button
              className="code"
              onClick={async () => {
                const link = `${location.origin}/?room=${view.code}`;
                try {
                  if (!navigator.clipboard?.writeText) {
                    setInviteLink(link);
                    return;
                  }
                  await navigator.clipboard.writeText(link);
                  setError("Invitation link copied.");
                } catch {
                  setInviteLink(link);
                }
              }}
            >
              ♧ {view.code} <small>Copy invite ↗</small>
            </button>
            {inviteLink && (
              <input
                aria-label="Invitation link"
                readOnly
                value={inviteLink}
                onFocus={(e) => e.target.select()}
                style={{ marginTop: 12 }}
              />
            )}
          </div>
          <div className="table circle-table">
            <div className="opponents">
              {[
                ...view.players.slice(
                  view.players.findIndex((p) => p.id === view.you) + 1,
                ),
                ...view.players.slice(
                  0,
                  view.players.findIndex((p) => p.id === view.you),
                ),
              ].map((p, i) => (
                <div
                  key={p.id}
                  className={`seat ${game?.turn === p.id ? "active" : ""}`}
                  style={{
                    left: `clamp(42px, ${50 + 43 * Math.cos(((view.players.length === 2 ? 270 : view.players.length === 3 ? 210 + i * 120 : 150 + (i * 240) / (view.players.length - 2)) * Math.PI) / 180)}%, calc(100% - 42px))`,
                    top: `${43 + 34 * Math.sin(((view.players.length === 2 ? 270 : view.players.length === 3 ? 210 + i * 120 : 150 + (i * 240) / (view.players.length - 2)) * Math.PI) / 180)}%`,
                  }}
                >
                  <div className="avatar">
                    {p.name[0]?.toUpperCase()}
                    <small>{p.bot ? "✦" : p.connected ? "●" : "○"}</small>
                  </div>
                  <strong>{p.name}</strong>
                  <span>
                    {game
                      ? p.escaped
                        ? "Got away ✓"
                        : `${p.count} cards`
                      : p.ready
                        ? "Ready ✓"
                        : "Taking a seat"}
                  </span>
                  {game && !p.escaped && (
                    <div
                      className="hidden-hand"
                      role="img"
                      aria-label={`${p.name}: ${p.count} face-down cards`}
                    >
                      {Array.from(
                        { length: Math.min(p.count, 5) },
                        (_, index) => (
                          <span
                            className="card-back"
                            key={index}
                            style={{
                              transform: `translateX(${(index - (Math.min(p.count, 5) - 1) / 2) * 9}px) rotate(${(index - (Math.min(p.count, 5) - 1) / 2) * 9}deg)`,
                            }}
                          >
                            <span>♠</span>
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  {!game && view.host === view.you && p.bot && (
                    <button onClick={() => send("removeBot", { player: p.id })}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="felt-center">
              {!game ? (
                <>
                  <span className="table-mark">♠</span>
                  <h2>
                    A little patience.
                    <br />A lot of possibilities.
                  </h2>
                  <p>Invite friends or add bots to fill your table.</p>
                </>
              ) : (
                <>
                  <div className="eyebrow">
                    {game.phase === "finished"
                      ? "ROUND COMPLETE"
                      : game.opening
                        ? "OPENING TRICK"
                        : `TRICK ${game.trickNumber}`}
                  </div>
                  {game.phase === "finished" ? (
                    <>
                      <h2>
                        {view.players.find((p) => p.id === game.loser)?.name} is
                        left holding the cards.
                      </h2>
                      <p>Everyone else got away. Another round?</p>
                    </>
                  ) : (
                    <>
                      <h2>
                        {game.phase === "between"
                          ? "A moment between tricks"
                          : turn
                            ? "Your move."
                            : `${view.players.find((p) => p.id === game.turn)?.name}’s move`}
                      </h2>
                      <div className="pile">
                        {game.pile.map((p, i) => (
                          <div key={i}>
                            <Card card={p.card} />
                            <small>
                              {
                                view.players.find((x) => x.id === p.player)
                                  ?.name
                              }
                            </small>
                          </div>
                        ))}
                      </div>
                      <p className="notice" aria-live="polite">
                        {game.message}
                      </p>
                      <span className="timer">
                        {Math.max(0, Math.ceil((game.deadline - now) / 1000))}s
                        ·{" "}
                        {game.phase === "between"
                          ? "Hand-taking window"
                          : "Follow suit if you can"}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="table-bottom">
              <span>
                {me?.name} <small>YOU</small>
              </span>
              <span>
                {game ? `${me?.count} cards` : "A seat with your name on it"}
              </span>
            </div>
          </div>
          {!game ? (
            <div className="lobby-actions">
              {view.host === view.you && (
                <>
                  <button
                    onClick={() => send("addBot")}
                    disabled={view.players.length >= 8}
                  >
                    + Add a bot
                  </button>
                  <button
                    className="primary"
                    onClick={() => send("start")}
                    disabled={
                      view.players.length < 3 ||
                      view.players.some((p) => !p.ready)
                    }
                  >
                    Deal the cards →
                  </button>
                </>
              )}
              <button onClick={() => send("ready")}>
                {me?.ready ? "Unready" : "I’m ready ✓"}
              </button>
              <p className="fine">
                {view.players.length}/8 seats · At least 3 players · All players
                must be ready
              </p>
            </div>
          ) : game.phase === "finished" ? (
            <div className="lobby-actions">
              {view.host === view.you ? (
                <button className="primary" onClick={() => send("rematch")}>
                  Play another round →
                </button>
              ) : (
                <p>Waiting for the host to deal again.</p>
              )}
            </div>
          ) : (
            <section className="hand-section">
              <div className="section-label">
                YOUR HAND{" "}
                <span>
                  {me?.escaped
                    ? "YOU GOT AWAY"
                    : turn
                      ? "SELECT A CARD, THEN PLAY"
                      : "PLAN YOUR NEXT MOVE"}
                </span>
              </div>
              <div className="hand">
                {view.hand.map((card) => (
                  <Card
                    key={card}
                    card={card}
                    selected={selected === card}
                    disabled={
                      !turn ||
                      game.phase !== "playing" ||
                      !view.legal.includes(card)
                    }
                    onClick={() => setSelected(card)}
                  />
                ))}
              </div>
              <div className="hand-actions">
                <span>
                  {selected
                    ? `Selected ${selected.slice(0, -1)}${symbols[selected.slice(-1)]}`
                    : me?.escaped
                      ? "Enjoy the rest of the round."
                      : "Your next move starts here."}
                </span>
                {game.phase === "between" && !me?.escaped ? (
                  <button onClick={() => send("take")}>
                    Take next player’s hand
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={!selected || !turn || game.phase !== "playing"}
                    onClick={() => send("play", { card: selected })}
                  >
                    Play card →
                  </button>
                )}
              </div>
            </section>
          )}
        </section>
      )}
      {error && (
        <div role="status" className="toast" onClick={() => setError("")}>
          {error} <span>×</span>
        </div>
      )}
      <footer>
        <span>MADE FOR THE WAY WE PLAY.</span>
        <button onClick={() => setRules(true)}>The house rules ↗</button>
        <span>♠ ♥ ♣ ♦</span>
      </footer>
      {rules && (
        <div className="modal-backdrop" onClick={() => setRules(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              autoFocus
              onClick={() => setRules(false)}
              aria-label="Close rules"
            >
              ×
            </button>
            <div className="eyebrow">THE HOUSE RULES</div>
            <h2 id="rules-title">Get away. Stay in good company.</h2>
            <ol>
              <li>
                Ace of Spades opens. Everyone follows spades if possible. The
                first trick is always discarded.
              </li>
              <li>
                Follow the lead suit whenever you can. If you cannot, play any
                card: that’s a Thulla.
              </li>
              <li>
                A Thulla stops the trick immediately. The highest lead-suit card
                takes the entire pile and leads next.
              </li>
              <li>
                If everyone follows suit, discard the trick. The highest card
                leads again.
              </li>
              <li>
                Empty your hand to get away, unless you retain the lead: then
                draw from the earlier waste pile and lead that card.
              </li>
              <li>
                Between tricks you may take the next active player’s whole hand,
                letting them escape.
              </li>
              <li>
                The last active player loses. Turns last 30 seconds; a bot
                covers missed turns.
              </li>
            </ol>
            <button className="primary" onClick={() => setRules(false)}>
              I’m ready for the table →
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

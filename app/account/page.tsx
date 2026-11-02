"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../src/supabase-browser";
const kinds = [
  ["profile_change", "Profile change"],
  ["account_recovery", "Account recovery"],
  ["data_export", "Data export"],
  ["account_deletion", "Delete account"],
  ["suspension_appeal", "Suspension appeal"],
  ["privacy", "Privacy"],
  ["other", "Other"],
];
export default function Account() {
  const [me, setMe] = useState<any>(),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [kind, setKind] = useState("other"),
    [subject, setSubject] = useState(""),
    [details, setDetails] = useState("");
  const headers = async () => {
    const {
      data: { session },
    } = await supabase!.auth.getSession();
    return {
      Authorization: `Bearer ${session?.access_token || ""}`,
      "Content-Type": "application/json",
    };
  };
  const load = async () => {
    if (!supabase) return;
    const res = await fetch("/api/me", { headers: await headers() }),
      json = await res.json();
    if (!res.ok) {
      setError(json.error);
      return;
    }
    setMe(json);
    setName(json.profile?.display_name || "");
  };
  useEffect(() => {
    load();
  }, []);
  if (!supabase)
    return (
      <main>
        <section className="auth-card">
          <h1>Supabase is not configured.</h1>
        </section>
      </main>
    );
  if (!me)
    return (
      <main>
        <section className="auth-card">
          <h1>{error || "Loading your account…"}</h1>
          <a href="/">Return to the table</a>
        </section>
      </main>
    );
  const winRate = me.stats?.matches
    ? Math.round((me.stats.wins / me.stats.matches) * 100)
    : 0;
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: await headers(),
      body: JSON.stringify({ displayName: name }),
    });
    if (!res.ok) setError((await res.json()).error);
    else load();
  }
  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({ kind, subject, details }),
    });
    if (!res.ok) setError((await res.json()).error);
    else {
      setSubject("");
      setDetails("");
      load();
    }
  }
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ♠{" "}
          <span>
            thulla<span className="brand-dot">.</span>
          </span>
        </a>
        {me.role !== "player" && (
          <a className="leave" href="/admin">
            Admin panel
          </a>
        )}
        <a className="leave" href="/">
          Back to table
        </a>
      </header>
      <section className="account-grid">
        <div>
          <div className="eyebrow">PLAYER PROFILE</div>
          <h1>{me.profile.display_name}</h1>
          <p>{me.user.email}</p>
          <form onSubmit={saveProfile}>
            <label>
              Display name
              <input
                value={name}
                maxLength={24}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button>Save profile</button>
          </form>
        </div>
        <div className="stats">
          <div>
            <b>{me.stats?.matches || 0}</b>
            <span>Matches</span>
          </div>
          <div>
            <b>{me.stats?.wins || 0}</b>
            <span>Wins</span>
          </div>
          <div>
            <b>{me.stats?.losses || 0}</b>
            <span>Losses</span>
          </div>
          <div>
            <b>{winRate}%</b>
            <span>Win rate</span>
          </div>
          <p>{me.stats?.bot_matches || 0} matches included bots.</p>
        </div>
      </section>
      <section className="account-grid">
        <div>
          <div className="eyebrow">RECENT MATCHES</div>
          {me.matches.length ? (
            <ul className="history">
              {me.matches.map((m: any) => (
                <li key={m.id}>
                  <b>{m.result}</b>
                  <span>
                    {m.ended_at
                      ? new Date(m.ended_at).toLocaleDateString()
                      : "In progress"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No completed matches yet.</p>
          )}
        </div>
        <div>
          <div className="eyebrow">ACCOUNT REQUEST</div>
          <form onSubmit={submitRequest}>
            <label>
              Request type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {kinds.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </label>
            <label>
              Details
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
              />
            </label>
            <button>Send request</button>
          </form>
          {error && <p className="error">{error}</p>}
          <ul className="history">
            {me.requests.map((r: any) => (
              <li key={r.id}>
                <b>{r.subject}</b>
                <span>
                  {r.status}
                  {r.admin_response ? `: ${r.admin_response}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <button
            className="leave"
            onClick={() =>
              supabase!.auth.signOut().then(() => location.assign("/"))
            }
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

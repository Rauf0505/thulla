"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../src/supabase-browser";
export default function Admin() {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [status, setStatus] = useState("active"),
    [role, setRole] = useState("player"),
    [wins, setWins] = useState(0),
    [losses, setLosses] = useState(0);
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
    const r = await fetch("/api/admin", { headers: await headers() }),
      j = await r.json();
    if (!r.ok) setError(j.error);
    else {
      setData(j);
      if (!target && j.users[0]) setTarget(j.users[0].id);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const update = async (
    action: string,
    payload: any,
    targetUserId = target,
    reasonText = reason,
  ) => {
    const r = await fetch("/api/admin", {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({
          action,
          userId: targetUserId,
          reason: reasonText,
          ...payload,
        }),
      }),
      j = await r.json();
    if (!r.ok) setError(j.error);
    else {
      setReason("");
      load();
    }
  };
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ♠{" "}
          <span>
            thulla<span className="brand-dot">.</span>
          </span>
        </a>
        <a className="leave" href="/account">
          My account
        </a>
      </header>
      <section className="auth-card admin-card">
        <div className="eyebrow">ADMIN PANEL</div>
        <h1>Account operations</h1>
        {error ? (
          <p className="error">{error}</p>
        ) : !data ? (
          <p>Loading queue…</p>
        ) : (
          <>
            <label>
              Player
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {data.users.map((u: any) => (
                  <option value={u.id} key={u.id}>
                    {u.display_name} · {u.matches} matches · {u.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required for the audit log"
              />
            </label>
            <div className="admin-actions">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspend</option>
                <option value="pending_deletion">Pending deletion</option>
              </select>
              <button onClick={() => update("set_status", { status })}>
                Update account status
              </button>
            </div>
            <div className="admin-actions">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="player">Player</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={() => update("set_role", { role })}>
                Update role
              </button>
              <button
                onClick={() => {
                  if (confirm("Anonymize this account?"))
                    update("anonymize_user", {});
                }}
              >
                Anonymize account
              </button>
            </div>
            <div className="admin-actions">
              <input
                type="number"
                min="0"
                value={wins}
                onChange={(e) => setWins(Number(e.target.value))}
              />
              <input
                type="number"
                min="0"
                value={losses}
                onChange={(e) => setLosses(Number(e.target.value))}
              />
              <button
                onClick={() =>
                  update("correct_stats", {
                    winsDelta: wins,
                    lossesDelta: losses,
                  })
                }
              >
                Add win/loss correction
              </button>
            </div>
            <h2>Open requests</h2>
            <ul className="history">
              {data.requests.map((r: any) => (
                <li key={r.id}>
                  <b>{r.subject}</b>
                  <span>
                    {r.kind} · {r.display_name} · {r.status}{" "}
                    <button
                      onClick={() => {
                        const note = `Resolved request: ${r.subject}`;
                        setTarget(r.user_id);
                        setReason(note);
                        update(
                          "resolve_request",
                          {
                            requestId: r.id,
                            status: "resolved",
                            response: "Reviewed by an administrator.",
                          },
                          r.user_id,
                          note,
                        );
                      }}
                    >
                      Resolve
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <h2>Recent audit activity</h2>
            <ul className="history">
              {data.audit.map((a: any) => (
                <li key={a.id}>
                  <b>{a.action}</b>
                  <span>{a.reason}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

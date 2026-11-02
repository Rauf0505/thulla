/**
 * Signals connected clients that a room changed. Clients still fetch their own
 * private view over HTTP; this payload deliberately carries no game state.
 */
export async function notifyRoom(code: string) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          { topic: `room:${code}`, event: "update", payload: { code } },
        ],
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok)
      console.error(
        "Realtime broadcast failed",
        response.status,
        await response.text(),
      );
  } catch (error) {
    console.error("Realtime broadcast failed", error);
  }
}

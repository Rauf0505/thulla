"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../src/supabase-browser";
export default function AuthCallback() {
  const [message, setMessage] = useState("Finishing your sign-in…");
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("code");
    if (!supabase || !code) {
      setMessage("Sign-in could not be completed.");
      return;
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setMessage(error.message);
      else location.replace("/");
    });
  }, []);
  return (
    <main>
      <section className="auth-card">
        <div className="eyebrow">GOOGLE ACCOUNT</div>
        <h1>{message}</h1>
        <a href="/">Return to the table</a>
      </section>
    </main>
  );
}

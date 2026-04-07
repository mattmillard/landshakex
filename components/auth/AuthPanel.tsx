"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function AuthPanel() {
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signIn = async () => {
    setMessage("");
    if (!supabase) {
      setMessage("Auth not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  };

  const signUp = async () => {
    setMessage("");
    if (!supabase) {
      setMessage("Auth not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setMessage(error.message);
    else setMessage("Check email to confirm sign up.");
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage("");
  };

  return (
    <div className="auth-panel">
      {!supabase ? (
        <div className="auth-msg">Auth disabled: missing public Supabase env vars.</div>
      ) : userEmail ? (
        <>
          <div className="auth-user">Signed in as {userEmail}</div>
          <button className="auth-btn" onClick={signOut}>Sign out</button>
        </>
      ) : (
        <>
          <input className="auth-input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="auth-input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="auth-actions">
            <button className="auth-btn" onClick={signIn}>Sign in</button>
            <button className="auth-btn alt" onClick={signUp}>Sign up</button>
          </div>
        </>
      )}
      {message ? <div className="auth-msg">{message}</div> : null}
    </div>
  );
}

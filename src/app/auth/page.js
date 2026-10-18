"use client";

import { useEffect, useState } from "react";
import { getCurrentSession, onAuthStateChange, signIn, signOut, signUp, requestPasswordReset, updatePassword } from "@/api/UserAPI";
import Brand from "@/components/brand/brand";
import ShopScrollerExperience from "@/components/shop-scroller-experience/shop-scroller-experience";
import styles from "./page.module.css";

export default function Home() {
  const [mode, setMode] = useState("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;
    let subscription;
    // Keep recovery links on the password form, including after a refresh.
    if (new URLSearchParams(window.location.search).get("reset") === "1") setMode("reset");
    try {
      subscription = onAuthStateChange((session, event) => {
        if (!mounted) return;
        if (event === "PASSWORD_RECOVERY") setMode("reset");
        setUser(session?.user || null);
        setLoading(false);
      }).data.subscription;
      getCurrentSession().then(({ data, error }) => {
        if (!mounted) return;
        if (error) setError(error.message);
        setUser(data.session?.user || null);
        setLoading(false);
      }).catch((error) => {
        if (mounted) { setError(error.message); setLoading(false); }
      });
    } catch (error) { setError(error.message); setLoading(false); }
    return () => { mounted = false; subscription?.unsubscribe(); };
  }, []);

  function changeMode(next) {
    setMode(next); setError(""); setMessage(""); setPassword(""); setConfirmation("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    try {
      if (mode === "forgot") {
        await requestPasswordReset(email.trim());
        setMessage("If an account exists for that email, you'll receive a password reset link. Check your inbox and spam folder.");
      } else if (mode === "reset") {
        if (!user) throw new Error("Open the password reset link from your email first, or request a new link.");
        if (password !== confirmation) throw new Error("Passwords do not match.");
        await updatePassword(password);
        window.history.replaceState({}, "", "/auth");
        setPassword(""); setConfirmation(""); setMode("signin");
      } else {
        const result = mode === "signup"
          ? await signUp({ username: username.trim().toLowerCase(), email: email.trim(), password })
          : await signIn({ identifier: identifier.trim(), password });
        if (result.session?.access_token) {
          setUser(result.user); setPassword("");
        } else if (mode === "signup") {
          changeMode("signin"); setIdentifier(username);
          setMessage("Account created. Confirm your email, then sign in with your username.");
        } else throw new Error("No active session was returned. Please try again.");
      }
    } catch (error) { setError(error.response?.data?.error || error.message || "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  async function handleSignOut() {
    setBusy(true); setError("");
    try { await signOut(); setUser(null); changeMode("signin"); }
    catch (error) { setError(error.message || "Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  }

  if (loading) return <main className={styles.page}><p role="status">Restoring your session…</p></main>;
  if (user && mode !== "reset") return <>
    <header className={styles.accountBar}>
      <span className={styles.accountEmail}>{user.user_metadata?.username || user.user_metadata?.name || "Shopper"}</span>
      {error && <span role="alert">{error}</span>}
      <button className={styles.signOutButton} onClick={handleSignOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
    </header> */
    <ShopScrollerExperience key={user.id} user={user} />
  </>;

  const titles = { signin: "Welcome back", signup: "Join the scroll", forgot: "Forgot password?", reset: "A fresh start" };
  const descriptions = { signin: "Enter your username or email and password.", signup: "Choose a username and make yourself at home.", forgot: "Enter your account email and we'll send you a reset link.", reset: "Choose a new password for your account." };
  const actions = { signin: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Save new password" };

  return <main className={styles.page}>
    <header className={styles.navigation}><Brand /></header>
    <div className={styles.content}>
      <div className={styles.intro}>
        <p className={styles.badge}>A little scroll. A better find.</p>
        <h1>Your next <em>favorite</em> is waiting.</h1>
        <p>A space for your taste, your wish list, and the finds that feel like you.</p>
        <div className={styles.palette} aria-hidden="true"><span /><span /><span /></div>
      </div>
      <section className={styles.card} aria-labelledby="login-title">
        <p className={styles.eyebrow}>Your taste. Your space.</p>
        <h2 className={styles.modalTitle} id="login-title">{titles[mode]}</h2>
        <p className={styles.modalDescription}>{descriptions[mode]}</p>
        <form className={styles.form} onSubmit={handleSubmit}>
          {mode === "signup" && <label className={styles.field}>Username
            <input className={styles.input} autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="your_username" pattern="[A-Za-z0-9_]{3,24}" title="3–24 letters, numbers, or underscores" minLength={3} maxLength={24} required />
            <small>3–24 letters, numbers, or underscores.</small>
          </label>}
          {mode === "signin" && <label className={styles.field}>Username or email
            <input className={styles.input} autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="your_username or you@example.com" required />
          </label>}
          {(mode === "signup" || mode === "forgot") && <label className={styles.field}>Email
            <input className={styles.input} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </label>}
          {mode !== "forgot" && <label className={styles.field}>{mode === "reset" ? "New password" : "Password"}
            <input className={styles.input} type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} minLength={mode === "signin" ? undefined : 8} placeholder={mode === "signin" ? "Enter your password" : "At least 8 characters"} required />
          </label>}
          {mode === "reset" && <label className={styles.field}>Confirm new password
            <input className={styles.input} type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={8} required />
          </label>}
          {mode === "signin" && <button className={styles.textButton} type="button" disabled={busy} onClick={() => changeMode("forgot")}>Forgot password?</button>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {message && <p className={styles.message} role="status">{message}</p>}
          <button className={styles.primaryButton} disabled={busy} type="submit">{busy ? "Please wait…" : actions[mode]}</button>
        </form>
        <p className={styles.switchMode}>
          {mode === "signin" ? "New here? " : mode === "signup" ? "Already have an account? " : "Remember your password? "}
          <button className={styles.textButton} type="button" disabled={busy} onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create an account" : "Back to sign in"}</button>
        </p>
      </section>
    </div>
  </main>;
}

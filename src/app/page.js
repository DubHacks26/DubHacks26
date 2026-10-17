"use client";

import { useState } from "react";
import { signIn, signUp } from "@/api/UserAPI";
import styles from "./page.module.css";

export default function Home() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const result = isSignUp
        ? await signUp({ name, email, password })
        : await signIn({ email, password });

      if (!result.session?.access_token) {
        if (isSignUp) {
          setMessage(
            "Account created. Check your email to confirm your address, then sign in."
          );
          setIsSignUp(false);
          setPassword("");
        } else {
          setError("No active session was returned. Please try signing in again.");
        }
        return;
      }

      setUser(result.user);
      setIsLoginOpen(false);
      setName("");
      setPassword("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          requestError.message ||
          "Unable to sign in. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Welcome</p>
        <h1 className={styles.title}>Your space starts here.</h1>
        <p className={styles.description}>
          Sign in to continue to your account.
        </p>

        {user ? (
          <p className={styles.signedIn}>Signed in as {user.email}</p>
        ) : (
          <button
            className={styles.primaryButton}
            onClick={() => {
              setError("");
              setMessage("");
              setIsSignUp(false);
              setIsLoginOpen(true);
            }}
          >
            Sign in
          </button>
        )}
      </section>

      {isLoginOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setIsLoginOpen(false)}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className={styles.closeButton}
              type="button"
              aria-label="Close sign in dialog"
              onClick={() => setIsLoginOpen(false)}
            >
              ×
            </button>

            <p className={styles.eyebrow}>Your account</p>
            <h2 className={styles.modalTitle} id="login-title">
              {isSignUp ? "Create account" : "Sign in"}
            </h2>
            <p className={styles.modalDescription}>
              {isSignUp
                ? "Create an account to get started."
                : "Enter your email and password to continue."}
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              {isSignUp && (
                <label className={styles.field}>
                  <span>Name</span>
                  <input
                    autoComplete="name"
                    autoFocus
                    className={styles.input}
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    required
                  />
                </label>
              )}

              <label className={styles.field}>
                <span>Email</span>
                <input
                  autoComplete="email"
                  autoFocus={!isSignUp}
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className={styles.field}>
                <span>Password</span>
                <input
                  autoComplete="current-password"
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </label>

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className={styles.message} role="status">
                  {message}
                </p>
              )}

              <button
                className={styles.primaryButton}
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? isSignUp
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>

            <p className={styles.switchMode}>
              {isSignUp ? "Already have an account?" : "New here?"}{" "}
              <button
                className={styles.textButton}
                type="button"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setIsSignUp(!isSignUp);
                }}
              >
                {isSignUp ? "Sign in" : "Create an account"}
              </button>
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

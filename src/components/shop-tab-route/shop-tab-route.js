"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentSession, onAuthStateChange, signOut } from "@/api/UserAPI";
import ShopScrollerExperience from "@/components/shop-scroller-experience/shop-scroller-experience";
import styles from "@/app/auth/page.module.css";

export default function ShopTabRoute({ initialPage }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let subscription;
    try {
      subscription = onAuthStateChange((session) => {
        if (!mounted) return;
        setUser(session?.user || null);
        setLoading(false);
      }).data.subscription;
      getCurrentSession().then(({ data, error: sessionError }) => {
        if (!mounted) return;
        if (sessionError) setError(sessionError.message);
        setUser(data.session?.user || null);
        setLoading(false);
      }).catch((sessionError) => {
        if (!mounted) return;
        setError(sessionError.message || "Your session could not be restored.");
        setLoading(false);
      });
    } catch (sessionError) {
      Promise.resolve().then(() => {
        if (!mounted) return;
        setError(sessionError.message || "Your session could not be restored.");
        setLoading(false);
      });
    }
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [loading, router, user]);

  async function handleSignOut() {
    setBusy(true);
    setError("");
    try {
      await signOut();
      router.replace("/auth");
    } catch (signOutError) {
      setError(signOutError.message || "Unable to sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) {
    return <main className={styles.page}><p role={error ? "alert" : "status"}>{error || "Restoring your session…"}</p></main>;
  }

  return <>
    <ShopScrollerExperience
      key={user.id}
      initialPage={initialPage}
      onSignOut={handleSignOut}
      signOutBusy={busy}
      signOutError={error}
      user={user}
    />
  </>;
}

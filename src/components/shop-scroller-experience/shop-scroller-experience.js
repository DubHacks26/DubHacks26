"use client";

import { useEffect, useState } from "react";
import { createProfile, restoreProfile } from "@/utils/feed.mjs";
import Landing from "@/components/landing/landing";
import Onboarding from "@/components/onboarding/onboarding";
import AppShell from "@/components/shop-scroller/shop-scroller";

export default function ShopScrollerExperience({ user, initialPage = "Discover" }) {
  const [stage, setStage] = useState("loading");
  const [profile, setProfile] = useState(createProfile);
  const [storageError, setStorageError] = useState("");
  const storageKey = `shopscroller:profile:v1:${user.id}`;

  useEffect(() => {
    let restored = createProfile();
    try { restored = restoreProfile(JSON.parse(localStorage.getItem(storageKey))); }
    catch { setStorageError("Saved preferences could not be loaded. Changes will stay in this session."); }
    setProfile(restored);
    setStage(restored.onboarded ? "app" : "landing");
  }, [storageKey]);

  useEffect(() => {
    if (stage === "loading") return;
    try { localStorage.setItem(storageKey, JSON.stringify(profile)); }
    catch { setStorageError("Browser storage is unavailable. Your changes will only last for this session."); }
  }, [profile, stage, storageKey]);

  if (stage === "loading") return <p role="status">Loading your feed…</p>;
  if (stage === "landing") return <Landing onStart={() => setStage("onboarding")} />;
  if (stage === "onboarding") return <Onboarding onDone={preferences => {
    setProfile(current => ({ ...current, preferences: preferences || current.preferences, onboarded: true }));
    setStage("app");
  }} />;
  return <><AppShell initialPage={initialPage} profile={profile} setProfile={setProfile} user={user} />{storageError && <p role="status" className="storage-notice">{storageError}</p>}</>;
}

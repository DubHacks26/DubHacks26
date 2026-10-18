"use client";

import { useEffect, useState } from "react";
import {
  createProfile,
  recordAction,
  removeAction,
  restoreProfile,
} from "@/utils/feed.mjs";
import {
  deleteProductAction,
  loadFeedProfile,
  migrateLegacyProfile,
  saveFeedPreferences,
  saveProductAction,
} from "@/utils/feed-persistence";
import { recordPositiveInteraction } from "@/api/UserAPI";
import Landing from "@/components/landing/landing";
import Onboarding from "@/components/onboarding/onboarding";
import AppShell from "@/components/shop-scroller/shop-scroller";

export default function ShopScrollerExperience({ user, initialPage = "Discover" }) {
  const [stage, setStage] = useState("loading");
  const [profile, setProfile] = useState(createProfile);
  const [historyProducts, setHistoryProducts] = useState([]);
  const [loadError, setLoadError] = useState("");
  const storageKey = `shopscroller:profile:v1:${user.id}`;

  useEffect(() => {
    let active = true;
    loadFeedProfile(user.id)
      .then(async ({ profile: loadedProfile, hasRemoteData, historyProducts: loadedHistory }) => {
        if (!hasRemoteData) {
          const stored = window.localStorage.getItem(storageKey);
          if (stored) {
            const legacyProfile = restoreProfile(JSON.parse(stored));
            if (legacyProfile.onboarded || legacyProfile.events.length) {
              await migrateLegacyProfile(user.id, legacyProfile);
              const migrated = await loadFeedProfile(user.id);
              if (active) {
                setProfile(migrated.profile);
                setHistoryProducts(migrated.historyProducts);
                setStage(migrated.profile.onboarded ? "app" : "landing");
              }
              return;
            }
          }
        }
        if (!active) return;
        setProfile(loadedProfile);
        setHistoryProducts(loadedHistory);
        setStage(loadedProfile.onboarded ? "app" : "landing");
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error.message);
        setStage("error");
      });
    return () => {
      active = false;
    };
  }, [storageKey, user.id]);

  async function finishOnboarding(preferences = profile.preferences) {
    await saveFeedPreferences(user.id, preferences, true);
    setProfile((current) => ({ ...current, preferences, onboarded: true }));
    setStage("app");
  }

  async function persistAction(asin, action) {
    const event = await saveProductAction(user.id, asin, action);
    let embeddingApplied = null;
    let embeddingError = null;
    if (action === "like" || action === "save") {
      try {
        embeddingApplied = await recordPositiveInteraction(asin, action);
      } catch (error) {
        embeddingError = error.message;
      }
    }
    setProfile((current) => recordAction(current, asin, action, event));
    return { ...event, embeddingApplied, embeddingError };
  }

  async function undoPersistedAction(eventId) {
    await deleteProductAction(user.id, eventId);
    setProfile((current) => removeAction(current, eventId));
  }

  async function updatePreferences(preferences) {
    await saveFeedPreferences(user.id, preferences, true);
    setProfile((current) => ({ ...current, preferences, onboarded: true }));
  }

  if (stage === "loading") return <p role="status">Loading your feed…</p>;
  if (stage === "error") {
    return (
      <main className="shop-page">
        <p role="alert">Could not load your saved preferences and product feedback: {loadError}</p>
        <button type="button" onClick={() => window.location.reload()}>Try again</button>
      </main>
    );
  }
  if (stage === "landing") return <Landing onStart={() => setStage("onboarding")} />;
  if (stage === "onboarding") return <Onboarding onDone={finishOnboarding} />;
  return (
    <AppShell
      initialPage={initialPage}
      onPersistAction={persistAction}
      onUndoAction={undoPersistedAction}
      onUpdatePreferences={updatePreferences}
      profile={profile}
      setProfile={setProfile}
      user={user}
      historyProducts={historyProducts}
    />
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createProfile,
  recordAction,
  removeAction,
  restoreProfile,
  likedCollectionId,
} from "@/utils/feed.mjs";
import {
  deleteProductAction,
  loadFeedProfile,
  migrateLegacyProfile,
  saveFeedPreferences,
  saveProductAction,
} from "@/utils/feed-persistence";
import { createProductActionQueue, withPendingActions } from "@/utils/optimistic-actions.mjs";
import { recordSemanticInteraction } from "@/api/UserAPI";
import Landing from "@/components/landing/landing";
import Onboarding from "@/components/onboarding/onboarding";
import AppShell from "@/components/shop-scroller/shop-scroller";

function syncLikedCollection(profile) {
  if (!Array.isArray(profile.collections)) return profile;
  return {
    ...profile,
    collections: [
      { id: likedCollectionId, name: "Liked", productIds: profile.likes.map(String) },
      ...profile.collections.filter(collection => collection.id !== likedCollectionId),
    ],
  };
}

export default function ShopScrollerExperience({
  user,
  initialPage = "Home",
  onSignOut,
  signOutBusy = false,
  signOutError = "",
}) {
  const [stage, setStage] = useState("loading");
  const [profile, setProfile] = useState(createProfile);
  const [pendingActions, setPendingActions] = useState([]);
  const [enqueueAction] = useState(() => createProductActionQueue((asin, action, context) => saveProductAction(user.id, asin, action, context)));
  const displayedProfile = useMemo(() => syncLikedCollection(withPendingActions(profile, pendingActions)), [profile, pendingActions]);
  const [historyProducts, setHistoryProducts] = useState([]);
  const [learningRevision, setLearningRevision] = useState(0);
  const [loadError, setLoadError] = useState("");
  const storageKey = `shopscroller:profile:v1:${user.id}`;
  const collectionsKey = `shopscroller:collections:v1:${user.id}`;

  const withStoredCollections = useCallback((loadedProfile) => {
    let customCollections = [];
    try {
      const stored = window.localStorage.getItem(collectionsKey);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) {
        const ids = new Set();
        customCollections = parsed
          .filter(collection => collection && typeof collection.id === "string"
            && collection.id !== likedCollectionId
            && typeof collection.name === "string"
            && Array.isArray(collection.productIds))
          .map(collection => ({
            id: collection.id,
            name: collection.name.trim(),
            productIds: [...new Set(collection.productIds.map(String))],
          }))
          .filter(collection => collection.name && !ids.has(collection.id) && ids.add(collection.id));
      }
    } catch {
      customCollections = [];
    }

    // Older saves were not assigned to collections. Keep them accessible in a
    // regular collection so they can be organized from the new Save picker.
    const assignedIds = new Set(customCollections.flatMap(collection => collection.productIds));
    const unassignedSaved = loadedProfile.saved.filter(id => !assignedIds.has(String(id))).map(String);
    if (unassignedSaved.length) {
      const legacySaved = customCollections.find(collection => collection.id === "saved");
      if (legacySaved) {
        legacySaved.productIds = [...new Set([...legacySaved.productIds, ...unassignedSaved])];
      } else {
        customCollections.unshift({ id: "saved", name: "Saved", productIds: unassignedSaved });
      }
    }

    return {
      ...loadedProfile,
      collections: [
        { id: likedCollectionId, name: "Liked", productIds: loadedProfile.likes.map(String) },
        ...customCollections,
      ],
      saved: [...new Set(customCollections.flatMap(collection => collection.productIds))],
    };
  }, [collectionsKey]);

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
                setProfile(withStoredCollections(migrated.profile));
                setHistoryProducts(migrated.historyProducts);
                setStage(migrated.profile.onboarded ? "app" : "landing");
              }
              return;
            }
          }
        }
        if (!active) return;
        setProfile(withStoredCollections(loadedProfile));
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
  }, [storageKey, user.id, withStoredCollections]);

  useEffect(() => {
    if (!profile.collections || stage === "loading" || stage === "error") return;
    const customCollections = profile.collections.filter(collection => collection.id !== likedCollectionId);
    window.localStorage.setItem(collectionsKey, JSON.stringify(customCollections));
  }, [collectionsKey, profile.collections, stage]);

  async function finishOnboarding(preferences = profile.preferences) {
    await saveFeedPreferences(user.id, preferences, true);
    setProfile((current) => ({ ...current, preferences, onboarded: true }));
    setStage("app");
  }

  async function persistAction(asin, action, context = {}) {
    const pending = { id: `pending-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, productId: asin, action, dwellMs: context.dwellMs, createdAt: new Date().toISOString() };
    setPendingActions(current => [...current, pending]);
    let event;
    try {
      event = await enqueueAction(asin, action, context);
      setProfile(current => syncLikedCollection(recordAction(current, asin, action, event)));
    } finally {
      // Success reconciles with the durable event; failure rolls back only this
      // intent, preserving later clicks and changes to other products.
      setPendingActions(current => current.filter(item => item.id !== pending.id));
    }
    const learning = ["like", "save", "skip", "too_expensive", "less_category"].includes(action)
      ? recordSemanticInteraction(asin, action, context).then(applied => {
          if (applied) setLearningRevision(revision => revision + 1);
          return { applied };
        }).catch(error => ({ error: error.message }))
      : Promise.resolve({ applied: false });
    // Saving and UI feedback do not wait for semantic/vector learning.
    return { ...event, learning };
  }

  async function undoPersistedAction(eventId) {
    await deleteProductAction(user.id, eventId);
    setProfile((current) => syncLikedCollection(removeAction(current, eventId)));
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
      learningRevision={learningRevision}
      initialPage={initialPage}
      onPersistAction={persistAction}
      onUndoAction={undoPersistedAction}
      onUpdatePreferences={updatePreferences}
      profile={displayedProfile}
      setProfile={setProfile}
      user={user}
      historyProducts={historyProducts}
      onSignOut={onSignOut}
      signOutBusy={signOutBusy}
      signOutError={signOutError}
    />
  );
}

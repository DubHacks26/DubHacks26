"use client";

import { useCallback, useEffect, useState } from "react";
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
import { recordPositiveInteraction } from "@/api/UserAPI";
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

export default function ShopScrollerExperience({ user, initialPage = "Discover" }) {
  const [stage, setStage] = useState("loading");
  const [profile, setProfile] = useState(createProfile);
  const [historyProducts, setHistoryProducts] = useState([]);
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
    setProfile((current) => syncLikedCollection(recordAction(current, asin, action, event)));
    return { ...event, embeddingApplied, embeddingError };
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

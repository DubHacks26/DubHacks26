import AxiosInstance from "@/utils/axiosInstance";
import { getSupabaseClient } from "@/utils/supabaseClient";
import { requestHandler } from "@/utils/tools";

const catalogCache = new Map();

async function getUserInfo() {
  const res = await requestHandler(AxiosInstance.get(`/user/user`, {}));
  if (res.status == 200) {
    return { loggedIn: true, data: res.data };
  }
  return { loggedIn: false, data: {} }
}

async function getCatalogProducts(limit = 100, { refresh = false } = {}) {
  const cached = catalogCache.get(limit);
  if (!refresh && cached && Date.now() - cached.createdAt < 5 * 60 * 1000) {
    return cached.promise;
  }

  const entry = {
    createdAt: Date.now(),
    promise: AxiosInstance.get("/user/catalog", { params: { limit } })
      .then(response => response.data?.products || []),
  };
  catalogCache.set(limit, entry);
  try {
    return await entry.promise;
  } catch (error) {
    if (catalogCache.get(limit) === entry) catalogCache.delete(limit);
    throw error;
  }
}

async function getRecommendations(limit = 100, exclude = []) {
  const response = await AxiosInstance.get("/user/recommendations", {
    params: {
      limit,
      exclude: exclude.filter(id => /^[A-Z0-9]{10}$/.test(String(id))).slice(0, 500).join(","),
    },
  });
  return response.data?.products || [];
}

async function getProductsByAsins(asins = []) {
  if (!asins.length) return [];
  const response = await AxiosInstance.get("/user/history-products", {
    params: { asins: asins.join(",") },
  });
  return response.data?.products || [];
}

async function searchCatalogProducts(query, { learn = false } = {}) {
  const response = learn
    ? await AxiosInstance.post("/user/search", { query })
    : await AxiosInstance.get("/user/search", { params: { query } });
  return response.data;
}

async function searchFriendAccounts(query) {
  const response = await AxiosInstance.get("/user/friends/search", {
    params: { query },
  });
  return response.data?.users || [];
}

async function getFriendData() {
  const response = await AxiosInstance.get("/user/friends");
  return response.data;
}

async function sendFriendRequest(friendId) {
  const response = await AxiosInstance.post("/user/friends/requests", { friendId });
  return response.data;
}

async function respondToFriendRequest(friendId, accept) {
  const response = await AxiosInstance.patch("/user/friends/requests", { friendId, accept });
  return response.data;
}

async function removeFriend(friendId) {
  const response = await AxiosInstance.delete(`/user/friends/${encodeURIComponent(friendId)}`);
  return response.data;
}

async function shareProductWithFriend(friendId, asin) {
  const response = await AxiosInstance.post("/user/friends/shares", { friendId, asin });
  return response.data;
}

async function recordSemanticInteraction(asin, action, { dwellMs } = {}) {
  const payload = { asin, action };
  if (Number.isInteger(dwellMs)) payload.dwellMs = dwellMs;
  const response = await AxiosInstance.post("/user/interactions", payload);
  return response.data?.applied === true;
}

async function getHashtagGraph({ hashtag, limit = 500, linkLimit = 2000 } = {}) {
  const response = await AxiosInstance.get("/hashtags/graph", {
    params: {
      ...(hashtag ? { hashtag } : {}),
      limit,
      linkLimit,
    },
  });
  return response.data || { nodes: [], links: [] };
}

// Retain this export for callers that only send positive actions.
const recordPositiveInteraction = (asin, action) => recordSemanticInteraction(asin, action);

async function signIn(credentials) {
  const response = await AxiosInstance.post("/auth/signin", credentials);
  await persistSession(response.data?.session);

  return response.data;
}

async function signUp(credentials) {
  const response = await AxiosInstance.post("/auth/signup", credentials);
  await persistSession(response.data?.session);

  return response.data;
}

async function persistSession(session) {
  if (!session?.access_token || !session?.refresh_token) {
    return;
  }

  const { error } = await getSupabaseClient().auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error) {
    throw error;
  }
}

function getCurrentSession() {
  return getSupabaseClient().auth.getSession();
}

function onAuthStateChange(callback) {
  return getSupabaseClient().auth.onAuthStateChange((_event, session) => {
    callback(session, _event);
  });
}

async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();

  if (error) {
    throw error;
  }
}

async function getHashtagAlignment(nodeIds = []) {
  const response = await AxiosInstance.post('/hashtags/alignment', { nodeIds });
  return response.data || { hasInterests: false, scores: {} };
}

export {
  getCatalogProducts,
  getHashtagGraph,
  getRecommendations,
  getProductsByAsins,
  searchCatalogProducts,
  searchFriendAccounts,
  getFriendData,
  sendFriendRequest,
  respondToFriendRequest,
  removeFriend,
  shareProductWithFriend,
  getCurrentSession,
  getUserInfo,
  onAuthStateChange,
  recordSemanticInteraction,
  recordPositiveInteraction,
  getHashtagAlignment,
  signIn,
  signOut,
  signUp,
};

export async function requestPasswordReset(email) {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth?reset=1`,
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await getSupabaseClient().auth.updateUser({ password });
  if (error) throw error;
}

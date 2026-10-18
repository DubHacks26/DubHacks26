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

export { getCatalogProducts, getCurrentSession, getUserInfo, onAuthStateChange, signIn, signOut, signUp };

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

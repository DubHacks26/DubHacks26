import AxiosInstance from "@/utils/axiosInstance";
import { getSupabaseClient } from "@/utils/supabaseClient";
import { requestHandler } from "@/utils/tools";

async function getUserInfo() {
  const res = await requestHandler(AxiosInstance.get(`/user/user`, {}));
  if (res.status == 200) {
    return { loggedIn: true, data: res.data };
  }
  return { loggedIn: false, data: {} }
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
    callback(session);
  });
}

async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();

  if (error) {
    throw error;
  }
}

export { getCurrentSession, getUserInfo, onAuthStateChange, signIn, signOut, signUp };

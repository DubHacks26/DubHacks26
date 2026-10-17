import axios from "axios";
import { SERVER } from "./config.js";
import { getSupabaseClient } from "./supabaseClient";
import { toast } from "react-toastify";

// Axios Interceptor Instance
const AxiosInstance = axios.create({
  baseURL: SERVER,
  // Custom Express routes authenticate requests with a Supabase Bearer token.
  withCredentials: false,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

AxiosInstance.interceptors.request.use(async (config) => {
  if (typeof window === "undefined") {
    return config;
  }

  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  } else {
    delete config.headers.Authorization;
  }

  return config;
});

AxiosInstance.interceptors.response.use(
  (response) => {
    const message = response?.data?.message;
    const type = response?.data?.status === 200 ? "success" : "error";
    if (message && type) {
      toast(message, { type });
    }
    return response;
  },
  (err) => {
    if (err?.response?.data?.message) {
      toast.error(err?.response?.data?.message);
    }

    return Promise.reject(err);
  }
);

export default AxiosInstance;

import axios from "axios";
import { SERVER } from "./config.js";
import { toast } from "react-toastify";

// Axios Interceptor Instance
const AxiosInstance = axios.create({
  baseURL: SERVER,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
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
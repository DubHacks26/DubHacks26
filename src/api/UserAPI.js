import AxiosInstance from "@/utils/axiosInstance";
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
  setAccessToken(response.data?.session?.access_token);

  return response.data;
}

async function signUp(credentials) {
  const response = await AxiosInstance.post("/auth/signup", credentials);
  setAccessToken(response.data?.session?.access_token);

  return response.data;
}

function setAccessToken(accessToken) {
  if (accessToken) {
    AxiosInstance.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
  }
}

export { getUserInfo, signIn, signUp };

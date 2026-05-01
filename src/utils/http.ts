import axios, { AxiosRequestConfig } from "axios";

export async function httpGet<T>(
  url: string,
  params?: Record<string, any>,
  headers?: Record<string, string>
): Promise<T> {
  const config: AxiosRequestConfig = {
    params,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...headers,
    },
    timeout: 15000,
  };

  const response = await axios.get<T>(url, config);
  return response.data;
}

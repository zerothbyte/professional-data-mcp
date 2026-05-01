import axios, { AxiosRequestConfig } from "axios";

export async function httpGet<T>(
  url: string,
  params?: Record<string, any>,
  headers?: Record<string, string>
): Promise<T> {
  const config: AxiosRequestConfig = {
    params,
    headers: {
      "User-Agent": "ProfessionalDataMCP/1.0",
      ...headers,
    },
    timeout: 15000,
  };

  const response = await axios.get<T>(url, config);
  return response.data;
}

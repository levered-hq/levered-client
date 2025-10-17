import axios from "axios";
import fs from "fs/promises";
import path from "path";

interface LeveredConfig {
  secretKey: string;
  apiEndpoint: string;
}

const readConfig = async (): Promise<LeveredConfig> => {
  const configPath = path.join(
    process.cwd(),
    ".levered",
    "levered.config.json"
  );
  try {
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      "Could not read .levered/levered.config.json. Please run 'levered init' first."
    );
  }
};

export const callLeveredService = async (
  endpoint: string,
  method: "POST" | "GET",
  body: object
): Promise<object> => {
  const { secretKey, apiEndpoint } = await readConfig();
  const url = `${apiEndpoint}${endpoint}`;

  try {
    const response = await axios({
      method,
      url,
      data: body,
      headers: {
        "X-API-Key": secretKey,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        error: `API call failed: ${error.message}`,
        status: error.response?.status,
        data: error.response?.data,
      };
    }
    throw error;
  }
};

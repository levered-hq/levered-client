import fs from "fs/promises";

export const readFile = async (filePath: string): Promise<string> => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return `Error: File not found at ${filePath}`;
    }
    throw error;
  }
};

import fs from "fs/promises";
import path from "path";

const IGNORED_DIRS = ["node_modules", ".git", "dist", "build"];

export const scanFileSystem = async (dir: string): Promise<string[]> => {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const res = path.resolve(dir, dirent.name);
      if (IGNORED_DIRS.includes(dirent.name)) {
        return [];
      }
      return dirent.isDirectory() ? scanFileSystem(res) : res;
    })
  );
  return Array.prototype.concat(...files);
};

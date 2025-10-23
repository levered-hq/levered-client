import fs from "fs/promises";
import path from "path";
import ignore from "ignore";

const IGNORED_DIRS = ["node_modules", ".git", "dist", "build"]; // Kept for safety

let ig: ReturnType<typeof ignore> | null = null;

const getGitignore = async () => {
  if (ig) {
    return ig;
  }
  try {
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
    ig = ignore().add(gitignoreContent);
    return ig;
  } catch (error) {
    // .gitignore not found, return a dummy ignore instance
    ig = ignore();
    return ig;
  }
};

export const scanFileSystem = async (
  dir: string,
  rootDir: string = process.cwd()
): Promise<string[]> => {
  const gitignore = await getGitignore();
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const res = path.resolve(dir, dirent.name);
      const relativePath = path.relative(rootDir, res);

      if (
        IGNORED_DIRS.includes(dirent.name) ||
        gitignore.ignores(relativePath)
      ) {
        return [];
      }

      return dirent.isDirectory() ? scanFileSystem(res, rootDir) : res;
    })
  );
  return Array.prototype.concat(...files);
};

import fs from "fs/promises";
import { readFile } from "./readFile";

export const replaceCodeInFile = async (
  filePath: string,
  start: number,
  end: number,
  replacementText: string
): Promise<void> => {
  const content = await readFile(filePath);
  if (content.startsWith("Error:")) {
    throw new Error(content);
  }

  let postReplacementContent =
    content.slice(0, start) + replacementText + content.slice(end);

  const importStatement = "import { LeveredComponent } from '@levered/client';";

  if (postReplacementContent.includes(importStatement)) {
    await fs.writeFile(filePath, postReplacementContent, "utf-8");
    return;
  }

  const useClientRegex = /^(\s*["']use client["'];?\s*)/;
  const match = postReplacementContent.match(useClientRegex);

  let finalContent: string;
  if (match) {
    const directive = match[0];
    const restOfFile = postReplacementContent.substring(directive.length);
    finalContent = `${directive}${importStatement}\n${restOfFile}`;
  } else {
    finalContent = `${importStatement}\n${postReplacementContent}`;
  }

  await fs.writeFile(filePath, finalContent, "utf-8");
};

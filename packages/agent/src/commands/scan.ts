import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import chalk from "chalk";
import { scanFileSystem } from "../tools/scanFileSystem";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

interface LeveredMemory {
  files: string[];
  elements: Record<string, { filePath: string }>;
  lastScanned: string;
}

const targetElements = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "button",
];

const generateStableId = (
  filePath: string,
  elementName: string,
  position: number
) => {
  const hash = crypto.createHash("sha256");
  hash.update(`${filePath}:${elementName}:${position}`);
  return hash.digest("hex").slice(0, 10);
};

export const scanCommand = async () => {
  const scanDir = process.cwd(); // Start from the project root
  const leveredDir = path.join(process.cwd(), ".levered");
  const memoryPath = path.join(leveredDir, "memory.json");

  try {
    console.log(chalk.blue("Scanning project for JSX/TSX files..."));
    const files = await scanFileSystem(scanDir);
    const tsxFiles = files.filter(
      (file) => file.endsWith(".tsx") || file.endsWith(".jsx")
    );

    let taggedElementsCount = 0;
    const newElements: Record<string, { filePath: string }> = {};

    for (const file of tsxFiles) {
      try {
        console.log(
          chalk.gray(`  Processing ${path.relative(process.cwd(), file)}...`)
        );
        const content = await fs.readFile(file, "utf-8");
        const ast = parse(content, {
          sourceType: "module",
          plugins: ["jsx", "typescript"],
        });

        let elementIndex = 0;
        traverse(ast, {
          JSXOpeningElement(path) {
            const elementName = t.isJSXIdentifier(path.node.name)
              ? path.node.name.name
              : null;

            if (elementName && targetElements.includes(elementName)) {
              const hasLeveredId = path.node.attributes.some(
                (attr) =>
                  t.isJSXAttribute(attr) && attr.name.name === "data-levered-id"
              );

              if (!hasLeveredId) {
                const id = generateStableId(file, elementName, elementIndex++);
                path.node.attributes.push(
                  t.jsxAttribute(
                    t.jsxIdentifier("data-levered-id"),
                    t.stringLiteral(id)
                  )
                );
                taggedElementsCount++;
                newElements[id] = { filePath: file };
              }
            }
          },
        });

        const { code } = generate(ast, {
          retainLines: true,
          concise: false,
        });
        await fs.writeFile(file, code, "utf-8");
      } catch (error) {
        console.error(chalk.red(`\nFailed to process file: ${file}`));
        // Re-throw the original error to be caught by the outer try-catch block
        throw error;
      }
    }

    let memory: LeveredMemory = {
      files: [],
      elements: {},
      lastScanned: "",
    };
    try {
      const oldMemory = await fs.readFile(memoryPath, "utf-8");
      memory = JSON.parse(oldMemory);
    } catch (e) {
      // File doesn't exist, it's fine. We'll create it.
    }

    memory.files = files;
    memory.lastScanned = new Date().toISOString();
    memory.elements = { ...memory.elements, ...newElements };

    await fs.mkdir(leveredDir, { recursive: true });
    await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2));
    console.log(chalk.green(`Scan complete. Found ${files.length} files.`));
    if (taggedElementsCount > 0) {
      console.log(
        chalk.green(
          `Tagged ${taggedElementsCount} new elements with data-levered-id.`
        )
      );
    }
    console.log(chalk.green(`Results saved to ${memoryPath}`));
  } catch (error) {
    console.error(chalk.red("Failed to scan codebase"), error);
  }
};

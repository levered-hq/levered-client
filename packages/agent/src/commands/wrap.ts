import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import { readFile } from "../tools/readFile";
import { findReactComponentAST } from "../tools/findReactComponentAST";
import { findJsxElementByIdAST } from "../tools/findJsxElementByIdAST";
import { callLeveredService } from "../tools/callLeveredService";
import { replaceCodeInFile } from "../tools/replaceCodeInFile";
import { askUserForConfirmation } from "../tools/askUserForConfirmation";

const checkSdkInstallation = async () => {
  // Check 1: Is it in package.json? (Standard install)
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    if (dependencies["@levered/client"]) {
      return; // Found it, we're good.
    }
  } catch (e) {
    // package.json might not exist or be readable, proceed to next check.
  }

  // Check 2: Can Node resolve the module? (Handles `npm link`)
  try {
    require.resolve("@levered/client", { paths: [process.cwd()] });
  } catch (error) {
    throw new Error(
      "The @levered/client package is not installed. Please run 'levered init' or install it manually."
    );
  }
};

interface WrapOptions {
  file?: string;
  id?: string;
  yes?: boolean;
}

export const wrapCommand = async (
  componentOrId: string | undefined,
  options: WrapOptions
) => {
  try {
    await checkSdkInstallation();

    const isWrappingById = !!options.id;
    const targetName = isWrappingById ? options.id! : componentOrId!;
    let filePath = options.file;

    if (!targetName) {
      console.error(
        chalk.red(
          "Error: You must provide either a component name or an --id to wrap."
        )
      );
      return;
    }

    if (isWrappingById && !filePath) {
      console.log(chalk.blue("ID provided, finding file..."));
      const memoryPath = path.join(process.cwd(), ".levered", "memory.json");
      const memoryContent = await readFile(memoryPath);
      if (memoryContent.startsWith("Error:")) {
        throw new Error(
          "Could not read .levered/memory.json. Please run 'levered scan' first."
        );
      }
      const memory = JSON.parse(memoryContent);
      const elementInfo = memory.elements?.[targetName];

      if (!elementInfo?.filePath) {
        throw new Error(
          `Element with ID <${targetName}> not found in memory. Please run 'levered scan' again.`
        );
      }
      filePath = elementInfo.filePath;
      console.log(chalk.blue(`   ✅ Found element in: ${filePath}`));
    }

    if (!filePath) {
      throw new Error(
        "The --file option is required when wrapping a component by name."
      );
    }

    console.log(
      chalk.bold.magenta(
        `\nStarting wrapping for <${targetName}> in ${filePath}...\n`
      )
    );

    // 1. Find and extract the target's source code.
    console.log(`[1/4] 🔍 Finding target in ${filePath}...`);
    const fileContent = await readFile(filePath);

    let location: { code: string; start: number; end: number } | null = null;

    if (isWrappingById) {
      location = findJsxElementByIdAST(fileContent, targetName);
    } else {
      location = findReactComponentAST(fileContent, targetName);
    }

    if (!location) {
      throw new Error(`Target <${targetName}> not found in ${filePath}.`);
    }
    console.log(chalk.green("   ✅ Target found!"));

    // 2. Send the source code to the Component Service.
    console.log(`[2/4] 🚀 Sending component to Levered service...`);
    const createResponse = (await callLeveredService(
      "/api/v1/components",
      "POST",
      {
        name: targetName,
        code: location.code,
      }
    )) as { id?: string; error?: string };

    if (createResponse.error || !createResponse.id) {
      throw new Error(
        `API Error: ${createResponse.error || "No componentId returned."}`
      );
    }
    const { id } = createResponse;
    console.log(chalk.green(`   ✅ Component created with ID: ${id}`));

    // 3. Confirm with the user before replacing the code.
    const replacementText = `<LeveredComponent componentId="${id}" />`;

    let confirmed = options.yes;
    if (!confirmed) {
      console.log(`\nI will replace the target <${targetName}> with:\n`);
      console.log(chalk.yellow(replacementText));
      confirmed = await askUserForConfirmation("\nDo you want to proceed?");
    }

    if (!confirmed) {
      console.log(chalk.red("\nOperation cancelled by user."));
      return;
    }

    // 4. Replace the original code.
    console.log(`\n[4/4] 🔄 Replacing target in ${filePath}...`);
    await replaceCodeInFile(
      filePath,
      location.start,
      location.end,
      replacementText
    );
    console.log(chalk.green("   ✅ Target replaced successfully!"));

    console.log(
      chalk.bold.magenta(`\n✨ Successfully wrapped <${targetName}>! ✨\n`)
    );
  } catch (error) {
    console.error(chalk.red("\nWrapping failed:"), (error as Error).message);
  }
};

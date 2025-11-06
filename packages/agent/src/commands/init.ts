import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { exec } from "child_process";
import util from "util";
import { askUserForConfirmation } from "../tools/askUserForConfirmation";
import { askUserForInput } from "../tools/askUserForInput";
import { wrapRootComponent } from "../tools/wrapRootComponent";

const execAsync = util.promisify(exec);

const isGitRepository = async () => {
  try {
    const stat = await fs.stat(path.join(process.cwd(), ".git"));
    return stat.isDirectory();
  } catch (error) {
    return false;
  }
};

const getPackageManager = async (): Promise<"npm" | "yarn" | "pnpm"> => {
  try {
    await fs.access(path.join(process.cwd(), "yarn.lock"));
    return "yarn";
  } catch (error) {
    // Not yarn
  }
  try {
    await fs.access(path.join(process.cwd(), "pnpm-lock.yaml"));
    return "pnpm";
  } catch (error) {
    // Not pnpm
  }
  return "npm";
};

const installSdk = async () => {
  // First, check if the SDK is already installed or linked.
  try {
    require.resolve("@levered/client", { paths: [process.cwd()] });
    console.log(
      chalk.green(
        "\n@levered/client is already installed or linked. Skipping installation."
      )
    );
    return;
  } catch (error) {
    // Not found, so we proceed with installation.
  }

  const packageManager = await getPackageManager();
  const installCommand =
    packageManager === "yarn"
      ? "yarn add @levered/client"
      : `${packageManager} install @levered/client`;

  console.log(
    chalk.blue(`\nInstalling @levered/client using ${packageManager}...`)
  );
  try {
    await execAsync(installCommand);
    console.log(chalk.green("   ✅ SDK installed successfully!"));
  } catch (error) {
    console.error(chalk.red(`Failed to install @levered/client`), error);
    console.log(
      chalk.yellow(`Please install it manually by running: ${installCommand}`)
    );
  }
};

const findRootLayoutFile = async (): Promise<string | null> => {
  const candidates = [
    "app/layout.tsx",
    "src/app/layout.tsx",
    "pages/_app.tsx",
    "src/pages/_app.tsx",
    "src/App.tsx",
    "src/index.tsx",
  ];
  for (const candidate of candidates) {
    const fullPath = path.join(process.cwd(), candidate);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch (error) {
      // File doesn't exist, continue
    }
  }
  return null;
};

const addToGitignore = async () => {
  const gitignorePath = path.join(process.cwd(), ".gitignore");
  const ignoreEntry = "/.levered";

  try {
    let content = "";
    try {
      content = await fs.readFile(gitignorePath, "utf-8");
    } catch (e) {
      // .gitignore doesn't exist, we'll create it
    }

    if (!content.includes(ignoreEntry)) {
      const newContent = content.endsWith("\n")
        ? `${content}${ignoreEntry}\n`
        : `${content}\n${ignoreEntry}\n`;
      await fs.writeFile(gitignorePath, newContent);
      console.log(chalk.green("Added /.levered to .gitignore"));
    }
  } catch (error) {
    console.warn(
      chalk.yellow("Warning: Could not automatically update .gitignore.")
    );
  }
};

export const initCommand = async () => {
  if (!(await isGitRepository())) {
    console.error(
      chalk.red(
        "Error: Not a git repository. Please run 'git init' before 'levered init'."
      )
    );
    return;
  }

  console.log(
    chalk.bold.magenta("\nWelcome to Levered! Let's get you set up.")
  );

  const publicKey =
    process.env.LEVERED_PUBLIC_KEY ||
    (await askUserForInput("Enter your Public Key:"));
  const secretKey =
    process.env.LEVERED_SECRET_KEY ||
    (await askUserForInput("Enter your Secret Key:"));
  const apiEndpoint =
    process.env.LEVERED_API_ENDPOINT ||
    (await askUserForInput(
      "Enter the Levered API Endpoint (leave blank for default):"
    )) ||
    "https://api.levered.dev";

  const config = {
    publicKey,
    secretKey,
    apiEndpoint,
    llm: {
      provider: "gemini",
      apiKey: "env(GEMINI_API_KEY)",
    },
  };

  const leveredDir = path.join(process.cwd(), ".levered");
  const configPath = path.join(leveredDir, "levered.config.json");

  try {
    await fs.mkdir(leveredDir, { recursive: true });
    console.log(chalk.green("Created .levered directory"));

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green("Created .levered/levered.config.json"));

    await addToGitignore();
    await installSdk();

    console.log(chalk.blue("\nAttempting to wrap your root layout..."));
    const rootLayoutFile = await findRootLayoutFile();

    if (rootLayoutFile) {
      console.log(chalk.yellow(`Found root layout file: ${rootLayoutFile}`));
      const confirmed = await askUserForConfirmation(
        "May I wrap it with LeveredProvider to complete setup?"
      );
      if (confirmed) {
        await wrapRootComponent(rootLayoutFile, config);
        console.log(chalk.green("   ✅ Successfully wrapped root layout!"));
      } else {
        console.log(
          chalk.yellow(
            "Skipping automatic wrapping. Please add LeveredProvider to your root layout manually."
          )
        );
      }
    } else {
      console.log(
        chalk.yellow(
          "Could not find a root layout file. Please add LeveredProvider to your root layout manually."
        )
      );
    }
  } catch (error) {
    console.error(
      chalk.red("Failed to initialize project"),
      (error as Error).message
    );
  }
};

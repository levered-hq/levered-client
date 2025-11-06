#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { initCommand } from "./commands/init";
import { scanCommand } from "./commands/scan";
import { wrapCommand } from "./commands/wrap";
import { listenCommand } from "./commands/listen";

const program = new Command();

program.version("1.0.0").description("Levered Agent CLI");

program
  .command("init")
  .description("Initialize a new Levered project")
  .option("-y, --yes", "Skip user confirmation")
  .action(initCommand);

program
  .command("scan")
  .description("Scan the codebase for components")
  .action(scanCommand);

program
  .command("wrap [componentName]")
  .description("Wrap a component or element with Levered")
  .option(
    "-f, --file <path>",
    "Path to the file containing the target. Required for component wrapping."
  )
  .option("--id <id>", "The data-levered-id of the element to wrap")
  .option("-y, --yes", "Skip user confirmation")
  .action(wrapCommand);

program
  .command("listen")
  .description("Start Claude Code proxy server with HTTP API")
  .option("-p, --port <number>", "Port for HTTP server", "3100")
  .option(
    "-d, --directory <path>",
    "Working directory for Claude CLI",
    process.cwd()
  )
  .option("-c, --claude-path <path>", "Path to Claude CLI binary", "claude")
  .option("--host <string>", "Host to bind to", "localhost")
  .option(
    "--log-level <level>",
    "Logging level (debug, info, warn, error)",
    "info"
  )
  .option("--max-sessions <number>", "Max concurrent sessions", "1")
  .option("--timeout <seconds>", "Request timeout in seconds", "300")
  .option(
    "--detached",
    "Run server in background, outputting logs to agent.log"
  )
  .action(listenCommand);

program.parse(process.argv);

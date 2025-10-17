#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { initCommand } from "./commands/init";
import { scanCommand } from "./commands/scan";
import { wrapCommand } from "./commands/wrap";

const program = new Command();

program.version("1.0.0").description("Levered Agent CLI");

program
  .command("init")
  .description("Initialize a new Levered project")
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

program.parse(process.argv);

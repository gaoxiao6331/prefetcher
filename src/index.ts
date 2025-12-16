#!/usr/bin/env node

import { Command } from "commander";
import { version } from "../package.json";
import { start } from "./start";
import tools from "./tools";

const program = new Command();

program
  .name("prefetcher")
  .description("a tool to generate prefetch links")
  .version(version);

program
  .command("start")
  .description("start the prefetcher server")
  .action(() => {
    start();
  });

program
  .command("tool")
  .description("helper tool for using a prefetcher")
  .argument("<type>", 'which tool to use')
  .action((type, options) => {
	const tool = tools[type as keyof typeof tools];
	if(!tool) throw new Error(`Tool ${type} not found`);
	// @ts-expect-error
	tool(options);
  });

program.parse()
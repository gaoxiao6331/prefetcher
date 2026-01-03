import chalk from "chalk";
import { Command } from "commander";
import { version } from "../package.json";
import { start } from "./start";

const program = new Command();

program
	.name("prefetcher")
	.description("a tool to generate prefetch links")
	.version(version);

program
	.command("start")
	.description("start the prefetcher server")
	.option("-d, --debug", "enable debug mode", false)
	.action((opts) => {
		if (opts.debug) {
			console.log(chalk.green("Debug mode is on"));
		}
		start(opts);
	});

program.parse();

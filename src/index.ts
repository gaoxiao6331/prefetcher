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
  .action(() => {
    start();
  });

program.parse();

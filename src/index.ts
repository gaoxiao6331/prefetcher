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
  .command("gen-keys")
  .description("generate rsa keys for encryption")
  .action(() => {
    tools.genKeys();
  });

program
  .command("decrypt")
  .description("decrypt data using rsa private key")
  .requiredOption("-d, --data <data>", "encrypted data to decrypt")
  .requiredOption("-k, --key <key>", "rsa private key for decryption")
  .action((opts) => {
    tools.decrypt(opts);
  });

program.parse();

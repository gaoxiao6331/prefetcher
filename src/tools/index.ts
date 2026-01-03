import { Command } from "commander";
import { version } from "../../package.json";
import decrypt from "./decrypt";
import genKeys from "./gen-keys";
import releasePort from "./release-port";

const program = new Command();

program.name("tools").description("help use prefetcher").version(version);

program
	.command("gen-keys")
	.description("generate rsa keys for encryption")
	.action(() => {
		genKeys();
	});

program
	.command("decrypt")
	.description("decrypt data using rsa private key")
	.requiredOption("-d, --data <data>", "encrypted data to decrypt")
	.requiredOption("-k, --key <key>", "rsa private key for decryption")
	.action((opts) => {
		decrypt(opts);
	});

program
	.command("release-port")
	.description("release port")
	.argument("<port>", "port to release")
	.action((port) => {
		releasePort(port);
	});

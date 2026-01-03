import chalk from "chalk";
import CryptoRsaUtil from "@/utils/crypto-rsa";

const decrypt = (opts: { data: string; key: string }) => {
	console.log(chalk.bgGreen(" DECRYPT "));

	// 校验参数
	if (!opts.data || !opts.key) {
		console.log(chalk.red("Please provide encrypted data and private key."));
		return;
	}

	const decryptedData = CryptoRsaUtil.decrypt(opts.data, opts.key);

	console.log(chalk.bgGreen(" DECRYPTED DATA "));
	console.log(chalk.green(`${decryptedData}`));
};

export default decrypt;

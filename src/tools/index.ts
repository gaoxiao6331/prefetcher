import CryptoRsaUtil from "@/utils/crypto-rsa";
import chalk from "chalk";

const genKeys = () => {
  console.log(chalk.bgGreen(" GENERATE KEYS "));
  const { publicKey, privateKey } = CryptoRsaUtil.generateKeyPair(2048);

  console.log(chalk.bgGreen(" PUBLIC KEY "));
  console.log(chalk.green(`${publicKey}`));
  console.log(chalk.bgYellow(" PRIVATE KEY "));
  console.log(chalk.red(`Do not share your private key with anyone!!!`));
  console.log(chalk.yellow(`${privateKey}`));
};

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

export default {
  genKeys,
  decrypt,
};

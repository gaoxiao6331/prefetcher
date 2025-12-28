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

const releasePort = (port: string) => {
  console.log(chalk.bgGreen(" RELEASE PORT "));

  const portNum = Number.parseInt(port, 10);
  if (Number.isNaN(portNum) || portNum < 0 || portNum > 65535) {
    console.log(chalk.red("Port must be an integer between 0 and 65535."));
    return;
  }

  const command = `lsof -i :${port} | grep -v PID | awk '{print $2}' | xargs kill -9`;
  console.log(chalk.green(`${command}`));
};

export default {
  genKeys,
  decrypt,
  releasePort,
};

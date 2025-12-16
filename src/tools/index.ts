import CryptoRsaUtil from "@/utils/crypto-rsa";
import chalk from "chalk";

const genKeys = () => {
    const {
        publicKey,
        privateKey
    } = CryptoRsaUtil.generateKeyPair(2048);

    console.log(chalk.bgGreen(' PUBLIC KEY '))
    console.log(chalk.green(`${publicKey}`));
    console.log(chalk.bgYellow(' PRIVATE KEY '))
    console.log(chalk.red(`Do not share your private key with anyone!!!`));
    console.log(chalk.yellow(`${privateKey}`));
};

export default { 
    'gen-keys': genKeys
 };
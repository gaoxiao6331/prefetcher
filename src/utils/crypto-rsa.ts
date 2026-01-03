import chalk from "chalk";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { PASSPHRASE } from "@/env";

const CONFIG = {
	padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
	oaepHash: "sha256",
};

/**
 * 基于 Node.js 内置 crypto 模块的 RSA 非对称加密服务类
 * 支持加密/解密和数字签名/验证
 */
class CryptoRsaUtil {
	private publicKey: string;
	private privateKey: string;

	/**
	 * 构造函数
	 * @param modulusLength 密钥长度，默认 2048（推荐至少 2048）
	 */
	constructor(modulusLength: number = 2048) {
		const keyPair = CryptoRsaUtil.generateKeyPair(modulusLength);
		this.publicKey = keyPair.publicKey;
		this.privateKey = keyPair.privateKey;
	}

	/**
	 * 生成 RSA 密钥对
	 */
	static generateKeyPair(modulusLength: number): {
		publicKey: string;
		privateKey: string;
	} {
		if (!PASSPHRASE) {
			console.log(
				chalk.yellow(
					"PASSPHRASE environment variable is not set. Private key will not be encrypted.",
				),
			);
		}
		return crypto.generateKeyPairSync("rsa", {
			modulusLength: modulusLength,
			publicKeyEncoding: {
				type: "spki",
				format: "pem",
			},
			privateKeyEncoding: {
				type: "pkcs8",
				format: "pem",
				cipher: "aes-256-cbc",
				passphrase: PASSPHRASE, // 设置密码保护私钥
			},
		});
	}

	/**
	 * 使用公钥加密数据
	 * @param data 要加密的明文数据
	 * @param publicKey 公钥
	 */
	static encrypt(data: string, publicKey: string): string {
		const key = publicKey;
		const buffer = Buffer.from(data, "utf8");
		const encrypted = crypto.publicEncrypt(
			{
				key: publicKey,
				...CONFIG,
			},
			buffer,
		);
		return encrypted.toString("base64");
	}

	/**
	 * 使用私钥解密数据
	 * @param encryptedData Base64 格式的加密数据
	 * @param privateKey 私钥
	 */
	static decrypt(encryptedData: string, privateKey: string): string {
		const key = privateKey;
		const buffer = Buffer.from(encryptedData, "base64");
		const decrypted = crypto.privateDecrypt(
			{
				key: privateKey,
				passphrase: PASSPHRASE,
				...CONFIG,
			},
			buffer,
		);
		return decrypted.toString("utf8");
	}

	/**
	 * 获取公钥
	 */
	getPublicKey(): string {
		return this.publicKey;
	}

	/**
	 * 获取私钥
	 */
	getPrivateKey(): string {
		return this.privateKey;
	}

	/**
	 * 保存密钥对到文件
	 */
	async saveKeysToFile(directory: string = "./keys"): Promise<void> {
		try {
			await fs.promises.access(directory);
		} catch {
			await fs.promises.mkdir(directory, { recursive: true });
		}

		await fs.promises.writeFile(
			path.join(directory, "public.pem"),
			this.getPublicKey(),
		);
		await fs.promises.writeFile(
			path.join(directory, "private.pem"),
			this.getPrivateKey(),
		);
	}

	encrypt(data: string): string {
		return CryptoRsaUtil.encrypt(data, this.publicKey);
	}

	decrypt(encryptedData: string): string {
		return CryptoRsaUtil.decrypt(encryptedData, this.privateKey);
	}
}

export default CryptoRsaUtil;

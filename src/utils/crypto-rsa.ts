import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';


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
  static generateKeyPair(modulusLength: number): { publicKey: string, privateKey: string } {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: modulusLength,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: '', // 可设置密码保护私钥
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
    const buffer = Buffer.from(data, 'utf8');
    const encrypted = crypto.publicEncrypt(key, buffer);
    return encrypted.toString('base64');
  }

  /**
   * 使用私钥解密数据
   * @param encryptedData Base64 格式的加密数据
   * @param privateKey 私钥
   */
  static decrypt(encryptedData: string, privateKey: string): string {
    const key = privateKey;
    const buffer = Buffer.from(encryptedData, 'base64');
    const decrypted = crypto.privateDecrypt(key, buffer);
    return decrypted.toString('utf8');
  }

  /**
   * 使用私钥对数据进行数字签名
   * @param data 要签名的数据
   * @param privateKey 私钥
   */
  static sign(data: string, privateKey: string): string {
    const key = privateKey;
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();
    return sign.sign(key).toString('base64');
  }

  /**
   * 使用公钥验证数字签名
   * @param data 原始数据
   * @param signature Base64 格式的签名
   * @param publicKey 公钥
   */
  static verify(data: string, signature: string, publicKey: string): boolean {
    const key = publicKey;
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(key, Buffer.from(signature, 'base64'));
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
  saveKeysToFile(directory: string = './keys'): void {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(path.join(directory, 'public.pem'), this.getPublicKey());
    fs.writeFileSync(path.join(directory, 'private.pem'), this.getPrivateKey());
  }

  encrypt(data: string): string {
    return CryptoRsaUtil.encrypt(data, this.publicKey);
  }

  decrypt(encryptedData: string): string {
    return CryptoRsaUtil.decrypt(encryptedData, this.privateKey);
  }

  sign(data: string): string {
    return CryptoRsaUtil.sign(data, this.privateKey);
  }

  verify(data: string, signature: string): boolean {
    return CryptoRsaUtil.verify(data, signature, this.publicKey);
  }
}

export default CryptoRsaUtil;
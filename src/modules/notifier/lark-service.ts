import CryptoRsaUtil from "@/utils/crypto-rsa";
import axios from "axios";
import { FastifyInstance } from "fastify";

interface MessageConfig {
  color: string;
  content: string;
  extraElements: any[];
}

type MessageType = "info" | "error";

// 使用这个服务前需要配置飞书webhook token
class LarkNotifierService {
  private constructor(private fastify: FastifyInstance) { }

  static async create(fastify: FastifyInstance) {
    if (!fastify.config.crypto?.publicKey) {
      fastify.log.warn("Crypto config is missing");
    }
    return new LarkNotifierService(fastify);
  }

  private async send(message: string, type: MessageType, tokens: string[]) {
    if (!tokens || tokens.length === 0) {
      this.fastify.log.error("No tokens provided");
      throw new Error("No tokens provided");
    }
    const configMap: Record<MessageType, MessageConfig> = {
      info: {
        color: "green",
        content: "通知",
        extraElements: [],
      },
      error: {
        color: "red",
        content: "🚨警报🚨",
        extraElements: [
          {
            tag: "div",
            text: {
              content: "<at id=all></at>",
              tag: "lark_md",
            },
          },
        ],
      },
    };

    const config = configMap[type];

    const content = {
      msg_type: "interactive",
      card: {
        schema: "2.0",
        config: {
          update_multi: true,
          style: {
            text_size: {
              normal_v2: {
                default: "normal",
                pc: "normal",
                mobile: "heading",
              },
            },
          },
        },
        body: {
          direction: "vertical",
          padding: "12px 12px 12px 12px",
          elements: [
            {
              tag: "markdown",
              content: message,
              text_align: "left",
              text_size: "normal_v2",
              margin: "0px 0px 0px 0px",
            },
            ...config.extraElements,
          ],
        },
        header: {
          title: {
            tag: "plain_text",
            content: config.content,
          },
          subtitle: {
            tag: "plain_text",
            content: "",
          },
          template: config.color,
          padding: "12px 12px 12px 12px",
        },
      },
    };

    const url = `https://open.feishu.cn/open-apis/bot/v2/hook/`;

    const sendWithRetry = async (token: string, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await axios.post(url + token, content, { timeout: 5000 });
          if (res.status === 200 && res.data?.code === 0) {
            return;
          }
          throw new Error(res.data?.msg || `Lark API error: ${res.data?.code}`);
        } catch (err) {
          if (i === retries - 1) throw err;
          await new Promise(r => setTimeout(r, delay * (i + 1))); // Exponential-ish backoff
        }
      }
    };

    const reqs = tokens.map((token) => sendWithRetry(token));

    // 等待所有请求完成，无论成功还是失败
    const results = await Promise.allSettled(reqs);

    const success = results.every((result) => result.status === "fulfilled");
    if (!success) {
      // 出现错误抛出异常，因为会包含token信息，log要加密
      const key = this.fastify.config.crypto?.publicKey;
      const tokenStr = JSON.stringify(tokens);
      let logTokens = tokenStr;

      if (key) {
        try {
          logTokens = CryptoRsaUtil.encrypt(tokenStr, key);
        } catch (e) {
          this.fastify.log.error(e, 'Failed to encrypt tokens for logging');
          logTokens = '*** (Encryption Failed) ***';
        }
      }

      const failedReasons = results
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason.message);

      throw new Error(
        `Failed to send message(s) to Lark.
         Errors: ${JSON.stringify(failedReasons)}
         Tokens (Encrypted): ${logTokens}
        `
      );
    }
  }

  async info(message: string, tokens: string[]) {
    await this.send(message, "info", tokens);
  }

  async error(message: string, tokens: string[]) {
    await this.send(message, "error", tokens);
  }
}

export default LarkNotifierService;

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
  private constructor(
    private fastify: FastifyInstance,
  ) {}

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
        extraElements: [
        ],
      },
      error: {
        color: "red",
        content: "🚨警报🚨",
        extraElements: [
          {
              tag: "div",
              text: {
                content:
                  "<at id=all></at>",
                tag: "lark_md",
              },
            },
        ]
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

    const reqs = tokens.map(async (token) => {
      const res = await axios.post(url + token, content);
      // 请求状态是200且响应数据中code字段是0
      if (res.status === 200 && res.data?.code === 0) {
        return Promise.resolve("");
      } else {
        return Promise.reject(res.data?.msg || "Unknown error");
      }
    });

    // 等待所有请求完成，无论成功还是失败
    const results = await Promise.allSettled(reqs);

    const success = results.every((result) => result.status === "fulfilled");
    if (!success) {
      // 出现错误抛出异常，因为会包含token信息，log要加密
      const key = this.fastify.config.crypto?.publicKey;
      const tokenStr = JSON.stringify(tokens);
      const logTokens = key ? CryptoRsaUtil.encrypt(tokenStr, key) : tokenStr;
      this.fastify.log.error(
        {
          results,
          tokens: logTokens,
        },
        "Failed to send message(s) to Lark"
      );
      throw new Error("Failed to send message(s) to Lark");
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

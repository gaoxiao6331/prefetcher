import type { Config } from "../type";

const config: Config = {
  env: "dev",
  port: 3000,
  cdn: {
    jsDelivr: {
      localPath: "../cdn-test",
      remoteAddr: "https://github.com/gaoxiao6331/cdn-test",
    },
  },
  crypto: {
    publicKey: `
		-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAquz/IdBgznBQuLo6SB/r
i24mHWmSHJV6WWQhPwC5JeyMnVnDhZoORxvEPAjjeTw9ZuqEBwg6o/VrRcweWVNT
bogLbBbK/iiDHJYrN6tHjKInx5wTHTGOFphGFdhd5gVNIzhHsPahKdBNWhoI0RuR
N8r6TQHm46vN5H2VHKk60iFeNPYNrEB/x29+50nN1YFBuWsS28Y1eaBlk/sxbOYa
boFKDX9UWIrUBQKefkCawRcweqvbfx2HpMetxm28Bc+MDjAIoL3agNBrj14ZWCyv
ZZOZvs85RBxyxl3heVAyiG0c5JTCRRmySptN3ldD9ar3/S8T6QLFbH7QEGK3elYj
+QIDAQAB
-----END PUBLIC KEY-----
		`,
  },
};

export default config;

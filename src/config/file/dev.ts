import type { Config } from "../type";

const config: Config = {
  env: "dev",
  port: 3000,
  cdn: {
    jsDelivr: {
      localPath: "../cdn-test",
      remoteAddr: "https://github.com/gaoxiao6331/cdn-test",
      git: {
        name: 'prefetch bot',
        email: 'gaoxiao6331@163.com'
      }
    },
  },
  crypto: {
    publicKey: `
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAohqAR02ajEyXyR8XyQrL
q8DoW8LaxW0o4mMZpLf8k7LPbcUvAcqdvs9szMR4pwD86a/3n0FYbu+pKJAaKLQh
2o+8iVRY2S5TC2A/f9aH7xImLHLuGBToaEOxGBmZ4lc98akjdwKkjBVFRMMIzN18
1tzBv/MOn0vzmjvwS+lhWIFblLuVWkObHOscinIspeaa4jA0gVxO3cedhihEkU3s
UL2e4fOHSSsV9pHBvZKjVxQ/1E9K6ejsYAIg3F4Z0u8KLUXQmf/Ibxkh8IMVrCx3
7LmyEMneTzjAOv4RGFAamdEQJu+Sb75uJnj7A8ck/Y2/ovQ6yGptwIXm6TmglHys
nQIDAQAB
-----END PUBLIC KEY-----
		`,
  },
};

export default config;

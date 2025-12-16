import CryptoRsaUtil from "../crypto-rsa";

describe("crypto-rsa", () => {
  test("should encrypt and decrypt data correctly using auto-generated keys", () => {
    const data = "Hello, Prefetcher!";
    const cryptoRsaUtil = new CryptoRsaUtil();
    const encryptedData = cryptoRsaUtil.encrypt(data);
    expect(encryptedData).not.toBe(data);
    const decryptedData = cryptoRsaUtil.decrypt(encryptedData);
    expect(decryptedData).toBe(data);
  });

  test("should encrypt and decrypt data correctly using specified keys", () => {
    const data = "Hello, Prefetcher!";
    const publicKey = `
        -----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkdVWv1MWa4ieYYkKwiFe
bqf4OPnig9V+U/QynSE6/+WZ61fk3D9bcGgEa5KpxqjKixZJ/tUbT6BGJTcJlI9O
iynopJcnTJrkrHdANwOGN8c11ujkS2WZwFiSmEOpbyyj2eW9lw/Y7ValYnsY0LCl
YROFORtGyJ7lz0LRAYCWEQ2ukNYBwDInUqTtiPshrHEbFlcHHLBAOXDd1dZzZmNQ
W6KDIMWDUU+Qv8DmKVo/XrnQtNxsuys5XSngaPHusaySTpC4NA1Ha6wMb0+ACDUQ
ARGUmvsXk0oAu0gKIzr6bwho4GcwXEn/ZPsgArjVks23HgE3ZTZp1VX8AAxchEuc
CQIDAQAB
-----END PUBLIC KEY-----
        `.trim();
    const privateKey = `
        -----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFLTBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQwwHAQIXauLUJygicECAggA
MAwGCCqGSIb3DQIJBQAwHQYJYIZIAWUDBAEqBBBBTNVCH+Gm7oYeMJuGSmBNBIIE
0MXJQglaS7+JEAXeJv9bKUOiomefOhIRpMET9TII5FoLNd/xkRXYESRSJ6VhqUvp
qaZGJMZ8LDITgGsKMTR5C0SnVyekTydsC++h2QwLXjbhmNwL24UgnGdb8sPpn2C4
guyj0MmMPD988q6CtFADg4eZMWyoJPPaIh4kGYSsQLNIuZI8s7r/oitKQyhOkMQX
W6jL1uXPo1Pcg0Py8Qi49r6WPFA7fQitV+O2/qw4+Sd2sqfGwN/f5nsGFebEmzcg
RWwOqTPnCYSevL+IrzYNSnupysCQYlJcuFVXdp0AKTa9OylQ9yowRSFHqcP6r94V
EwQqQWrgeXiSwteKxvLb1QphQqJ4SU7byz+uD2mOfTwP7oydBYi5bQLAjb95l6O3
HkofvkNYPoBFCWDbPgIcQAplB5u1Nem9Q1gEp2O/PL2+Y6L91Nm+zXGFpqWijK0h
lJszKWleDxRlQsazXyDMUJlaR1RD+mbU4iXPxzgLU0OX6ujaFoyj+DveNJtHu1Ys
Tx2i0Yscun8ptOKLbESbkjQqSaggK1CymIGeL2OmclWZeMQrCTUKE9iAFOGT5Bq4
9CacZkN1lEgdy/RVuM2XLPpZ1ibP2V9aVB2BIDMu8bilRx4uH/XRahZNyuBCmJec
+m2/zhkUuDWxiEQNjFr2Vb46o+Dtb/8CnbbBrwNdRcyliHn595ObBEUWAB6MWPKj
iRgVkyVelO8rxOBs2Ly0Y9K2Sr0xVmU96WxpksBol+HeZLvQlN1sVrBupvq437Bq
qHH8ZCeMl/1mKhge16CKgwRTbDgrbxOKAYYTl0cLlkwq3YkW4CHgdBr3Enad9/GJ
u2Z/0yaSj1a6TqMbf5CIPG7jfdi54Eos480dxbFKCk6xsyXAJP2AjIC56Q5IOolb
uv46ZhQvbj3Fr5VpsqBNmJUNhbOiFXdLVRzIYnWzxOskrdfg1ijytdEOF5xvSeO0
Pnl+fSvT1IBYUeeYf3IW9Xqtbac6qmp7OEz2jzwhlnFv0mdbo4AYhRGVRcQGwMlv
nLZI1ebAA5XqMDi7KB7jg809/5qx5RB3l9fL7PIoTSa5QiAev3fr3r/XqhLD4k6/
U5swb0w67Dt5uvgosMImfxmouBHNmr8GldY9Rsfqdkipu1UHgnW8Pttz9jh+SVvE
ZrTZKnR+kkyQYUohCtd6VsNs00eq78SNmu9Mp3D5pXhmxEBGGiwzPf6/wm6CZVDn
Utnx81TbIokPoTSTv3KBpQCw3iIQJX3nMpQseX7x33gKEY5RKswKOB30OsUvV5rg
6RY51ZWfcNeqCOXWvje2wasyfw8fjKamTWYR9JxzbfSl9U6y8K0L5cIgSzygjyWp
2HEdEXnrwLQg4Pnaq/VvtyqKiqZ15zFNCHnCPv7IrbCGb7NPB/+ZSD3HlJul02GL
t/pNV2ugSSS4vsNP050xf2LnsFRX8kaO6T+dbhg0hzjqltb5Z+LjuTjCv9Be8WUD
h08ZRRGtrKaE79dlMvNOIEnrlfuW9eq3TNOJS4K1roKvoPCqwwO3zz2PxrI4g09J
Jy5f24BS2yg0Nkp68FRd+T7+avfjAZOAtFwBkVFtCZxyR6ZW/TFbn5jX2aMem7PO
xKexKVvJ5wh8D8cwFgia4z7o9peIGtqYe8XuC/e/sYDV
-----END ENCRYPTED PRIVATE KEY-----
        `.trim();
    const encryptedData = CryptoRsaUtil.encrypt(data, publicKey);
    expect(encryptedData).not.toBe(data);
    const decryptedData = CryptoRsaUtil.decrypt(encryptedData, privateKey);
    expect(decryptedData).toBe(data);
  });
});

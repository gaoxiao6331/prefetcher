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

  test("should sign and verify data correctly using auto-generated keys", () => {
    const data = "Hello, Prefetcher!";
    const cryptoRsaUtil = new CryptoRsaUtil();
    const signature = cryptoRsaUtil.sign(data);
    expect(signature).toBeDefined();
    const verified = cryptoRsaUtil.verify(data, signature);
    expect(verified).toBe(true);
  });

  test("should sign and verify data correctly using specified keys", () => {
    const data = "Hello, Prefetcher!";
    const publicKey = `
      -----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2ISov4DqE+ef1tkanObN
/r5/IqVe7ZSqYGmt4wkFkRtZP3vFChd9ljAPCUOhd6LrbH0DBXVAD0iAHgeW9982
+ZCciGe+Zs/v1D19kB+uiBt1t5nJP2FagARv0u3SuzA4F5jWtTG07Tzund3AiIBr
tFwQdxG/DsU4WlM4v4jQWvy+PZQLoIehEzAETzzRhBoYNGSLoVZWkbHxeHVDuIza
lQay3lv1Wrxr7BLwGYh7MQHOLMh4zQV/LV+7X29OoFDtfXUJPTr19IkBMCPIUHIP
IkJU+OuzmMZGP3rYXLkv/DsQSnnVASCMHp80ZzD8tnB1aCvdQGXVytkufSLesSrg
pQIDAQAB
-----END PUBLIC KEY-----
        `.trim();
    const privateKey = `
     -----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFLTBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQwwHAQI58mGgokc2F0CAggA
MAwGCCqGSIb3DQIJBQAwHQYJYIZIAWUDBAEqBBDOduaTusSKFkwzreVyIubjBIIE
0Fm5EdPVBmdjLod8Vp48h146nY0xHRGy8v7Xo8TMEfUjsqMJVr4nzaTC380Ne/yX
NpIBdmCyKuFJfFAjj+pMdAupRmZiPt2/37yQ5Agj0MnXrhysYYrrJtCjnFn94dFN
0G94KmZ7NvZI0FAhImkuefXpTNQHIl8KrS3aDuChZpnipE8jVD2XQnnJzYMD64UF
pCeb3ZB1EQlNFPgxozDzvP6Fvd0eYHCqRuBw1S+35J6jlA7dz/sp4xILU1/KLiaM
1xzgF/HioFJDVsvUO+0eBKqVOpjquBKsJT6WQF0TDIGyl3MdelGqK4ImUY9nVs16
UO819jqVSv6ce24b9YhicJGCgHDYTpykOieoI7qaxxeXXeoxxrhElduO5adjaG3c
/pXMjzDdHJg77vS1smqjUVe2qQHaYw2188fmsQ6k++NO1kEVysHuQS8ADHJv6Vjb
3KqqL5rz/Qxx/s7Vb9jcQwlLc6Ck1GNI+J7aUDE+YPOfnRWVqWVRxqqPhLtfEQPj
fSmkfXos5JttSYvkeBj/bdhdvfyZ0ocm3TJdxptV8FibkksZmLlauUlDPkarzLwc
B2eVlWlZIQsv3/9flmJJGg7qSpUptN6X4Ya8PasslemLoXMuyvT7m3G9NRYD+lVQ
lRE5qKOTJQegeLnBJx2hd02nqgH9WMnDd7djDukPZgDF7s92i/rz3uHYXUnCht7G
sH/0iZu47aKN6V/TR927pWBOhoVS/r8BJ+1Sqm3wx5kyk7lqe/Skj1oV4TmB3kCh
thDNFXLY/dT1Y/rHN9MbC2RGNULR4OiZmQYsZwrE7GHkCrCIb/qDoWl8umK05EkR
Q6oJVPJpZxusgl3eInvzBK7jBsZlxmWWL+4FDpSh/VoaSSArJINO//y8fbIjS5if
nSd4Rqgs/tZXy8wNb201LVoAmrn6WGZaCRQWhYDEeIjIKdw1t11rCZSIlwdJdfZf
SgePQ0YurllzRmBgLLgEHEu/BnY4XrXiwg9oZ5tHk3lUpB1F+FkWEv2/24iclrxm
lutsUifqKJ1XxvgPskcNyiU2euY2zLV+5jiwVmPnp7gj9QBm9FeIKq1M/sPcyGsF
77Z9w9AnNPlOIiUAC+z55eY6ni1t7FoMGVIFaXkkhIw+C1hceZ2Ipao2jL3ZQHYv
PDCp3V5WlJgva0i0qu1xe5e0lG6bmWM6sYdbskrurgbmicqMPOUDXSWHnbllbUPb
n6giWJ8nt0OnWdeXa8rAbhWHEuBiutDfQLHd2LWUbQ3cWaVZnMSBg0fO+O3U6rC+
tPHhCLbMuzeQIFnok/x3hwDBYZ/cQzkZUZD/QpbbepLZA9mkB+jnRv+06KijJPu9
PcXh92zVd5rXTFdQMy5S2LjsGh6NqGxzk8RQeb1T0DkUhoW3BGy9EB2tjl0sYQdd
NwtHh2aZIbVou14gQYf5TmmDyII8kootOEuLQUc2aQcqgfa2DOhY4PBp/OXUgvx7
tB+LYguAanhD6/8SbKMW4hPnZe7GgS0BL8yM8H2Q9ktn3AjQezHdFe1Kh+HnnhEs
GWnGPw1H12yQGwY9cW28XuUqs1+J1JJ0YxmuF3f87vs/4hd1mNVQZiMsxtsoSuhT
fROfUnocx8DXoEvp9RYpuwByQzB6fXcX7XNY+CpWyTrQ
-----END ENCRYPTED PRIVATE KEY-----
        `.trim();
    const signature = CryptoRsaUtil.sign(data, privateKey);
    expect(signature).toBeDefined();
    const verified = CryptoRsaUtil.verify(data, signature, publicKey);
    expect(verified).toBe(true);
  });
});

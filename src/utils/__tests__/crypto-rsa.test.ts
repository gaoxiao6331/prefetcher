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
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8A7Z7Zhp36GlFIdfmzjy
/8XOk2+W2q9sGnVxXe2s1/HHEPe4WEmdrzHHpT3b3wR+cdJYxKNbv7FucIepq8aD
uA4KVXUiS1QnXjyaUxAR5JQIpM7zs4Di9i1rY5DIl4JQvcC71X2jmM8kh/WpTVdL
6Qs43XD+5Jnn9kAu3P21Bn6Ul4qFoOkLM63URY+iwzVVUar54ituYoddX5IFNoyx
QyKupqbyN9PCU09YYIN1hr3c+/RibgeLYg4nQGvxHdUmzfeiB9H1AGwme4Du7Ja3
GBwjF/UOMwJZR3gnELpctQT/yagVn476/JliONEn9d3wwRpw3TuT1W+WB22QMNN6
8QIDAQAB
-----END PUBLIC KEY-----
        `.trim();
		const privateKey = `
-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFLTBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQwwHAQIWiehxDTqtJMCAggA
MAwGCCqGSIb3DQIJBQAwHQYJYIZIAWUDBAEqBBC/bUCIQ9OxVa5gVf2qiOVoBIIE
0LHYK+9ckhD6H8iAFm/qUjbPDP1zBkFU70nI1ETCvOzcdsVjmrGe662UunbmuFqE
oeyGPEB5zkyFW3Fnos7d9sPYoxoURyDmL8EQRWJt4YyrNBOU1GqLSsxaXh3SH5p1
riH6q022aEZXEbEZluw1atGzU0EHdKjp6YbUntkd048vGnLRqncCGTj2vVg7KwNC
epZjt0uxPNDWV/Og9eMkzAa6Lkqj+yC+IaOl0P0FmIzu9Mqp5EPcmc7WZBl/6JTq
HN0mwMlLzXMLANV/lHsgsiDVe0nNS7eOnn0sRaHy3zU+TJhVpnc2CgcYzEM1GsMz
8sTxzJlBgG7BtTOnqrruay7Dqi0L1OUF2bB9I36KnpyWgtRFtjgTS5/edOKViOQ8
6fblVmb/LBfB1GxeusHM3Y56rXgjmNrdU5cBGMfSqu0LMR03dgV1IE9/oWX47sNI
eiZgzGafK+f02jc2Ba47OlbAj0zUapm6YWk5rY99x/dMXa2rvGMpePBponqKVdY0
iVGfapdxTqN7ltAsD/7gnKOWls8F6elaB/dumrupXAuFiv69ToTfJkbjKL7G0WKd
YlO/lJFuDX/BXTM/Ite1Vw2Mk4CJJLjSbdaS2NGjNL8ebEOsoCxKnS4Za3hCsG5C
NhnjvjOD9RwDnDtNZz5W8Z/NOsK1hby1mfDuLgkf4Kq1AuF+KV0/C9ROt3kLWjT7
+mMQ5BL+/7MzdjYSRHBZcdwYxxwJ+gaUfKknQTdDNVUIdGN8Ldtzk+twPoJiZwMH
E7UtzU8hXPtTGI8T0aCcbaS4WJ3u2U7t5pnftFxfjLExdAQGDtk85V9WgnlEprN0
UGYUN1i7Z/1VDRtzML/SLmQamYxGQOw7jvszZPOw1FZkd914Bdl3NYcr8DsT0P1k
oLSTcZtunNGyKsF7+7A7hwGqnQaWBQR8D5EV7sllOrPpjbYGPG2H5jx1Ze0+IvYp
0n4ndAArFOfnG9fWHVCfif1/1IcnGb0GnexgK+upftuFj/YGXGmB2QszRffxmRjV
sF5gLy4lbhOghFp9rxV95qRrknT/buG11nhrZveD7/t6EXnhhud7X1UtX4Pflmgm
AhMngWIFgP1ujqFnkp3Y0O8isonXQGz5Nx2fR7/+cJDsUqxqEaIYSLeMikW956E5
li8baI2g8Y/LL7XLymptQ36j+gvUEOPHuwLK87jGChqmF0DmYu4ce+kUdqA3kmhG
QFllnJ5Jdfj8kHs6YJp1Gt1MxLdUVHRvJ7KSS/GUEQ2hP+u5SFkEuGfSXh6MzpyM
uwMoG3AipCltvIZVy7MnPCbvQY5Pdl15oVe3UyiJMjB5rLwn8RDXl9Y9ldPwNVLT
dDJVm2p4vKr3psp+ofSyQzcXkrdaRe/0DQa6KZ1y8YvAPIiqhaV+O7nWZ0rABoUo
SN5Vh4WxzEXLqd4enEQil3jYxrL09dHEX7Qwe9PNLlCkwL77C4OyekO8PZWSbYW0
kaID2GBXVDURDbpFF6fMTr1rRJ+ftIMj+yDuksFevCDfEtIPmH8NHETfYlhxLeeV
jmzfo7nJX61srVEljJ5sfscEhuPk9YGRwKIJ9CGZWyt7rznTTfmwPBYCTTVdOwcP
1EkFb2ovVCyi0OzL+NK3cP5KlaW1mGHPasKYw0ignvKE
-----END ENCRYPTED PRIVATE KEY-----
        `.trim();
		const encryptedData = CryptoRsaUtil.encrypt(data, publicKey);
		expect(encryptedData).not.toBe(data);
		const decryptedData = CryptoRsaUtil.decrypt(encryptedData, privateKey);
		expect(decryptedData).toBe(data);
	});
});

import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

const keys = await subtle.generateKey(
  {
    name: "ECDSA",
    namedCurve: "P-256",
  },
  true,
  ["sign", "verify"],
);

const publicKey = new Uint8Array(await subtle.exportKey("raw", keys.publicKey));
const privateJwk = await subtle.exportKey("jwk", keys.privateKey);

console.log("VAPID_PUBLIC_KEY=");
console.log(base64UrlEncode(publicKey));
console.log("");
console.log("VAPID_PRIVATE_JWK=");
console.log(JSON.stringify(privateJwk));
console.log("");
console.log("VAPID_SUBJECT=");
console.log("mailto:you@example.com");

function base64UrlEncode(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

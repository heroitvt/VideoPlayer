# Security & Access Control Guide

1. Admin Authentication: WebCrypto HMAC-SHA256 JWT sessions. Passwords protected with high-entropy salt or environment secrets.
2. TV Pairing Security: 6-digit dynamic pairing code with 10-minute expiration TTL, validated and rate-limited.
3. TV Device Token: High-entropy bearer tokens generated on pairing claim; verified against database SHA-256 hash.
4. R2 Storage Protection: Direct bucket access is private; streams are proxied with HTTP Range (206) support and client-level cache validation.

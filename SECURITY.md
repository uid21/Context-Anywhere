# Security policy

Please report security issues privately through the repository owner's preferred private contact channel. Do not open a public issue containing tokens, endpoint credentials, encrypted transfer links, or private note content.

AI Bridge stores its endpoint and write token in Obsidian's local plugin data. `data.json` is excluded from this repository. Encrypted transfer links still contain sensitive configuration ciphertext; treat them as private and use a separate, temporary transfer password.

Each read password grants read access to the same mirror. Once a deployment is registered for recovery, its Worker encrypts its current read passwords for the recovery key registered by the account owner. Readers of the R2 snapshot alone cannot decrypt it. Restrict Cloudflare management access, including access to the separate recovery KV namespace. A client with an existing OAuth grant can continue to refresh after you change the password. To remove its access, revoke the grant through that client's unlink or disconnect flow if supported. Each access token lasts one hour. Refresh credentials expire 365 days after the initial token exchange, and clients must save replacement refresh tokens to stay connected.

Vault scope controls future syncs. Narrowing it leaves previously uploaded copies in the mirror. Review existing mirror contents when changing what an AI should be able to read.

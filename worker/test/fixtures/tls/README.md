Public localhost-only test keys and certificates from nodejs/undici v7.30.1,
test/fixtures/tls-renegotiation (MIT license):
https://github.com/nodejs/undici/tree/v7.30.1/test/fixtures/tls-renegotiation

These are deliberately public test credentials, never deployment credentials.
The TLS renegotiation regression follows upstream test/tls-renegotiation.js.
Keep the test CA scoped to the test process; do not install it in the OS trust store.

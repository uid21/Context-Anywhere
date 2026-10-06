import assert from "node:assert/strict";
import test from "node:test";
import { authorizationRedirect, html } from "../src/oauth-response.js";

test("password form keeps same-origin submission and blocks scripts/framing", () => {
  const response = html("<form method='post' action='/authorize'></form>");
  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("validated callback starts a new document navigation without forwarding the password", async () => {
  const callback = "https://client.example/oauth/callback?code=opaque&state=original&iss=https%3A%2F%2Fworker.example";
  const response = authorizationRedirect(callback, { "set-cookie": "csrf=; Max-Age=0" });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.has("location"), false);
  assert.match(body, /http-equiv="refresh" content="0;url=https:\/\/client\.example\/oauth\/callback\?code=opaque&amp;state=original&amp;iss=/);
  assert.match(body, /<a href="https:\/\/client\.example\/oauth\/callback/);
  assert.doesNotMatch(body, /<script|<form|password/i);
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  assert.equal(response.headers.get("set-cookie"), "csrf=; Max-Age=0");
});

test("callback values cannot inject HTML into the transition page", async () => {
  const body = await authorizationRedirect('https://client.example/callback?state="/><script>alert(1)</script>&value=\'').text();
  assert.doesNotMatch(body, /<script>/);
  assert.match(body, /&quot;\/&gt;&lt;script&gt;/);
  assert.match(body, /&amp;value=&#39;/);
});

test("denied consent also returns error and state through the script-free page", async () => {
  const callback = "https://client.example/callback?error=access_denied&state=original";
  const body = await authorizationRedirect(callback).text();
  assert.match(body, /error=access_denied&amp;state=original/);
  assert.doesNotMatch(body, /授权成功|<script|<form/i);
});

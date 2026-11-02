# Security

Dispatch is reachable from the internet. A signed-in session can start full-access T3 agents on the Mac mini, and
those agents can run anything. It can also change Azure DevOps items. So anyone who gets a session effectively gets
remote code execution. The design follows from that.

## Who gets in
- **Passkeys only.** WebAuthn with user verification required: Face ID, Touch ID, Windows Hello or a device PIN. There are no passwords to phish or reuse, and passkeys are bound to `your-mac.your-tailnet.ts.net`, so a lookalike site can't use them.
- **Enrolment needs physical access to the Mac.** The first passkey, or a recovery passkey, needs a setup code that only `npm run cli -- setup-code` on the Mac creates. Codes are single-use, last 30 minutes, carry 50 bits of randomness, and each client gets 10 wrong codes per hour.
- **Account changes need a fresh passkey check**, even on a signed-in session: adding or removing a passkey, and signing in the phone app. A stolen cookie alone can't add an attacker's passkey or mint a 180-day app token. The last passkey can't be removed, and removing a passkey signs out every session opened with it, including app sessions issued from it.
- **Setup-code guessing** is limited per client and counts only failures, so nobody can lock you out by failing on purpose. A code is spent by the first registration attempt, so one code can't enrol two passkeys.
- **The phone app hand-off page** never redirects on its own. A link to it from elsewhere only gets an explicit button and a passkey prompt.

## Sessions
- Browser: an `__Host-dispatch` cookie (HttpOnly, Secure, SameSite=Strict, path /). It ends after 30 days without use.
- iPhone app: a bearer token in the Keychain, valid until 180 days without use. It is issued through an OAuth-style code flow with PKCE (S256): the code is single-use, lasts 2 minutes, and only works with the verifier of the app that started the sign-in. The callback is fixed to `dispatch://auth`, so there is no open redirect.
- Tokens are 256-bit random values. Only their SHA-256 is stored.
- Settings lists every signed-in device and lets you sign each one out. `npm run cli -- sessions` and `revoke <id>` do the same on the Mac.

## Requests
- The server listens on 127.0.0.1 only. Tailscale is the only way in: Funnel for the internet, serve for the tailnet. It marks internet traffic (`Tailscale-Funnel-Request`), and that mark is recorded with each session and audit entry.
- Browser writes need `X-Dispatch-Intent: 1`, a same-origin `Origin`, and `Sec-Fetch-Site` of same-origin. A page on another site can't produce that combination without a CORS preflight, and the server never answers preflights.
- Sign-in endpoints are rate limited to 30 requests a minute per client address. Pending passkey challenges are capped per client. Request bodies are capped at 64 KB.
- A request with an `Authorization` header is judged on that header alone; a cookie never rides along.
- Web Push subscriptions are only accepted for the browser vendors' push services, so the server can't be told to POST elsewhere.
- Headers: a strict CSP (scripts from self only, no framing), HSTS, nosniff, `Referrer-Policy: no-referrer`, COOP/CORP same-origin.
- Dispatch runs on its own port (10000), which is its own origin. Pages served on this host's other ports can't script Dispatch, read its responses, or pass its CSRF and passkey origin checks.
- **Known limit:** browsers scope cookies by host name, not port. The browser also sends the session cookie to the other services on `your-mac.your-tailnet.ts.net`, such as the public static server on port 443. Those services can't read it from scripts (HttpOnly), but their server process receives it. A dedicated host name for Dispatch (its own Tailscale node, or a Cloudflare Tunnel on your own domain) would remove this.

## What leaves the Mac
- **Azure DevOps** gets queries and state changes, through the signed-in `az` CLI identity.
- **Web Push** goes through the browser vendor's push service (Apple, Google or Mozilla). Payloads are end-to-end encrypted (RFC 8291), so the vendor can't read them.
- **APNs** goes to Apple. The notification title and body (item number, the agent's question, a suggestion) are visible to Apple in transit, as they are for any iOS notification.

## Audit
Every sign-in, failed sign-in, enrolment, passkey change, session revocation, thread start, answer, settle and ADO state
change is recorded with time, route (internet/tailnet/local) and client address. Settings shows the last 25.

## Turning public access off
`deploy/uninstall.sh` stops the service and closes the Funnel route. Alternatively, `tailscale funnel --https=10000 off`
keeps the service running but makes it unreachable from outside the Mac; re-adding it with `tailscale serve --https=10000 http://127.0.0.1:8795` restores tailnet-only access.

# Flutterwave Standard checkout

MakeChurchEasy uses Flutterwave's hosted Standard checkout. The API creates a
server-side payment link, stores the checkout intent, and verifies the returned
transaction before activating a plan.

## API environment

```dotenv
FLW_PUBLIC_KEY=FLWPUBK-...
FLW_SECRET_KEY=FLWSECK-...
FLW_ENCRYPTION_KEY=...
FLW_SECRET_HASH=...
```

Flutterwave local checkout markets are configured in
`api/src/lib/flutterwaveMarkets.ts`. The current local map is NGN, GHS, KES,
ZAR, UGX, TZS, RWF, and ZMW. Countries outside that map are not blocked: the
server resolves their checkout to USD so customers can try an international
Visa or Mastercard.

`FLW_SECRET_KEY` enables hosted checkout. `FLW_SECRET_HASH` is required for
webhook processing. Configure the webhook URL as:

```text
https://<public-api-host>/api/webhooks/flutterwave
```

The redirect flow remains safe without a webhook because the success page
calls Flutterwave's transaction verification endpoint and compares the stored
expected transaction reference, amount, currency, and successful status before
provisioning access. The expected values are written to the payment intent
before the hosted checkout link is created.

## Local and production setup

Keep the values in `api/.env.local` for local development and as sensitive
production environment variables on the API deployment. Do not place the
secret key or webhook hash in the dashboard's public environment variables or
commit either file containing real values.

The dashboard exposes Flutterwave when the API is configured. It displays the
same server-resolved local currency or USD fallback that the checkout will
actually use.

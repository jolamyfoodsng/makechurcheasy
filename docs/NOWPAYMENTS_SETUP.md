# NOWPayments setup

MakeChurchEasy uses the NOWPayments hosted invoice flow for crypto checkout. The API creates an invoice, redirects the customer to the returned hosted URL, and provisions access only after a signed `finished` notification is received or the authenticated status endpoint confirms the payment.

## API environment

Set these values in the API deployment environment. Do not commit them:

```env
NOWPAYMENTS_API_KEY=<server-side NOWPayments API key>
NOWPAYMENTS_IPN_SECRET=<NOWPayments IPN secret>
NOWPAYMENTS_IPN_CALLBACK_URL=https://<public-api-host>/api/webhooks/nowpayments
```

Optional settings:

```env
NOWPAYMENTS_DEFAULT_PAY_CURRENCY=usdttrc20
NOWPAYMENTS_FEE_PAID_BY_USER=false
NOWPAYMENTS_FIXED_RATE=false
NOWPAYMENTS_API_BASE_URL=https://api.nowpayments.io
# Optional override when the account supports a different set of base currencies.
NOWPAYMENTS_SUPPORTED_PRICE_CURRENCIES=USD,NGN,EUR,GBP,CAD,AUD,INR,PHP,ZAR
```

The callback URL must be public HTTPS in production. Configure the same URL in the NOWPayments dashboard under the IPN/payment settings. The value labelled “IPN URL” in a credential screen is normally the IPN secret; it is not the callback URL.

The checkout amount is sent in the account’s resolved pricing currency. NOWPayments supports a defined set of fiat base currencies, so confirm the currencies used by MakeChurchEasy in the NOWPayments account before enabling crypto checkout for every country. If a local currency is not supported, add a matching supported-currency pricing rule before presenting that payment method.

## Access and renewals

The standard invoice integration is a one-time payment. Monthly and yearly crypto purchases grant 30 or 365 days of access and are recorded with `autoRenew: false`; customers renew manually. Lifetime offers remain lifetime purchases.

## Verification

- Checkout: `POST /api/payments/initialize` with `paymentMethod: "nowpayments"`.
- Customer status: `GET /api/payments/nowpayments/status?reference=<order-id>`.
- Provider notification: `POST /api/webhooks/nowpayments` with the `x-nowpayments-sig` HMAC-SHA512 header.

The webhook validates the recursively sorted JSON signature, checks the order, amount, and currency, claims the intent idempotently, and reuses the existing entitlement/receipt provisioning path.

# MTN MoMo payments

MakeChurchEasy uses MTN MoMo Collection `requesttopay` for one-off checkout charges. The `bc-authorize` operation from the developer portal is a consent/CIBA flow; it is not the endpoint that charges a customer.

## API configuration

Set these variables in the API environment. Keep all keys server-side:

```env
MTN_MOMO_ENABLED=true
MTN_MOMO_BASE_URL=https://proxy.momoapi.mtn.com
MTN_MOMO_TARGET_ENVIRONMENT=mtnghana
MTN_MOMO_COUNTRY_CODE=GH
MTN_MOMO_ALLOWED_COUNTRIES=GH
MTN_MOMO_CURRENCY=GHS
MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY=...
MTN_MOMO_API_USER=...
MTN_MOMO_API_KEY=...
MTN_MOMO_CALLBACK_URL=https://api.example.com/api/webhooks/mtn-momo
```

For the shared sandbox use `https://sandbox.momodeveloper.mtn.com`, `sandbox`, and `EUR`; the account’s checkout pricing must also be EUR for the payment option to appear. Production uses the MTN country target environment and local currency, such as `mtnghana`/`GHS` or `mtnnigeria`/`NGN`.

```env
# Nigeria production example
MTN_MOMO_BASE_URL=https://proxy.momoapi.mtn.com
MTN_MOMO_TARGET_ENVIRONMENT=mtnnigeria
MTN_MOMO_COUNTRY_CODE=NG
MTN_MOMO_ALLOWED_COUNTRIES=NG
MTN_MOMO_CURRENCY=NGN
```

Before enabling production, subscribe to the **Collections** product, create the API user/key in the MoMo production portal, and register the HTTPS callback host. The credentials belong only in the API deployment environment; never in the dashboard or desktop app.

## Checkout flow

1. The dashboard requests `/api/payments/mtn-momo/config` and displays MTN MoMo only when credentials, country, currency, and platform payments are enabled.
2. `/api/payments/initialize` creates a UUID-backed payment intent and sends `requesttopay` to MTN.
3. The customer approves the request on the phone. The dashboard polls `/api/payments/mtn-momo/status`.
4. The callback route `/api/webhooks/mtn-momo` can wake up abandoned browser sessions. It re-queries MTN status before provisioning.
5. A successful payment is provisioned idempotently into the existing billing, subscription, referral, credit, email, and notification flows. MTN MoMo purchases are marked `autoRenew: false` because a `requesttopay` charge does not create automatic renewal authorization.

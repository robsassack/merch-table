# Stripe Local Webhook Testing

Required webhook events:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

Run Stripe CLI forwarding in a second terminal while `npm run dev` is running:

```bash
npm run stripe:listen
```

Trigger a test checkout completion event:

```bash
npm run stripe:trigger:checkout-complete
```

If your app runs on a different port (for example `3001`), run Stripe CLI directly with that port:

```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

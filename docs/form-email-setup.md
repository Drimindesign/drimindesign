# Form emails: one-time Cloudflare setup

Every inquiry (home page and Contact page) and every booked call (Appointment page) is emailed to **drimindesign@gmail.com**. Reply to the email and your reply goes straight to the visitor. The code is in `src/server/email/studio-email.ts`, and the `send_email` binding in `wrangler.jsonc`.

Cloudflare only delivers these emails after two dashboard steps. Both are free on every plan, because the emails only go to your own verified address. It takes about 5 minutes.

## 1. Turn on Email Routing for the domain

1. Cloudflare dashboard → **Compute** → **Email Service** → **Email Routing**.
2. **Onboard Domain** → pick `drimindesigns.co.in` → review the records → **Done**.

Cloudflare adds the email (MX, SPF, DKIM) records itself. The domain has no email today, so nothing existing breaks.

## 2. Verify drimindesign@gmail.com

1. In **Email Routing**, open **Destination addresses** → **Add destination address** → `drimindesign@gmail.com`.
2. Open the email Cloudflare sends to that Gmail and click the verification link.

The website sends from `forms@drimindesigns.co.in`. That address needs no mailbox; it only has to be on the domain from step 1.

## 3. Deploy and test

Push to `main` (or redeploy). Then fill in the inquiry form on the live site. Within a minute or so the email should arrive in Gmail. If not, look in Spam and mark it **Not spam** once.

If something is wrong, the form tells the visitor "Something went wrong on our side", and the details show under **Workers & Pages → drimindesign → Logs**. Common causes: the address isn't verified yet (`E_RECIPIENT_NOT_ALLOWED`), or Email Routing isn't on (`E_SENDER_DOMAIN_NOT_AVAILABLE`).

## Optional: a professional address

In **Email Routing → Routing rules**, add `hello@drimindesigns.co.in` → forward to `drimindesign@gmail.com`. Mail to that address then lands in your Gmail too, and you could show it on the site instead of the Gmail address (`email` in `src/content/site.ts` and `src/content/inquiry.ts`).

## What isn't covered yet

- **No database.** Your Gmail is the record of every submission. A searchable history needs a database (Cloudflare D1, free tier) behind the same repositories.
- **Double bookings aren't fully prevented.** Taken call slots are remembered per server instance only, so in rare cases two people could book the same slot. D1 with a unique slot fixes that.

# MediaSaturn MarTech Candidate Exercise

Welcome! This project is the playground you'll use during the MediaSaturn MarTech engineering interview. Your goal is to wire Google Tag Manager (GTM) into the local storefront, respect user consent, send ecommerce events to a custom collector, and prove that the captured data can be enriched and queried.

## 1. Prerequisites
- Node.js 18+ and npm
- A GTM Web container (you can create a free one with any Google account)
- Modern browser with dev tools

## 2. Setup

```bash
npm install
npm run dev          # serves http://localhost:4000 with hot reload
```

Open `http://localhost:4000` in your browser. You'll see a small store with buttons that push ecommerce events into `window.dataLayer` and list the last five pushes in the UI.

Useful helper routes:
- `GET /events/raw` – inspect the most recent payloads captured by the collector.
- `GET /events/enriched` – inspect the ETL results once you have run `npm run etl`.
- `GET /health` – ensures the Express server is running.

## 3. Scenario overview
MediaSaturn wants to understand how users interact with key ecommerce actions (`add_to_cart`, `checkout`, `purchase`). Everything needs to run locally except GTM itself. You'll complete the following steps during the live exercise:

1. Inject your GTM snippet into the page.
2. Configure triggers/variables for the ecommerce events.
3. Build Custom HTML tags that forward those events to the local `/collect-pixel` API **only when marketing consent exists**.
4. Validate the database entries, enrich them with CRM data, and run SQL to answer a business question.

## 4. Consent handling
The page displays a consent banner the first time it loads. A decision is stored both in `localStorage` and in the cookie `ms_consent_marketing`. When consent is granted, the banner hides and `window.__msConsent.marketing` becomes `true`. Every dataLayer push includes `marketing_consent` so you can reference it in GTM.

During implementation you must:
- Block firing the collector tag until consent is `true`.
- Use either the `consent_update` event or the `marketing_consent` flag to drive your trigger logic.
- Demonstrate that declining consent prevents any network calls to `/collect-event`.

## 5. GTM work
1. Insert the GTM container snippet at the right place in `public/index.html`.
2. Create data layer variables for `event`, `sessionId`, `user.id`, `user.email`, `ecommerce`, and `marketing_consent`. Click the **Simulate Login** button to persist `user-401` in `localStorage`; afterwards every dataLayer event will include that user object until you clear storage. A `page_view` event fires on every load using those properties—use it to validate your baseline setup. **Important:** sanitize GTM variables so you never send the literal string `"undefined"` for `sessionId`/`userId`; the collector stores what you send.
3. Set up triggers for the three ecommerce events.
4. Build one or multiple Custom HTML tags that send pixel-style requests to the local collector (`GET /collect-pixel`). All parameters must be URL encoded and the `payload` query param should contain JSON-serialized ecommerce data. Example:

```html
<script>
  var payload = encodeURIComponent(JSON.stringify({ ecommerce: {{DLV - ecommerce}} }));
  var parts = [
    'eventType=' + encodeURIComponent('{{Event}}'),
    'sessionId=' + encodeURIComponent('{{DLV - sessionId}}'),
    'userId=' + encodeURIComponent('{{DLV - user.id}}'),
    'payload=' + payload
  ];
  var pixel = new Image();
  pixel.src = 'http://localhost:4000/collect-pixel?' + parts.join('&');
</script>
```

Feel free to tailor the variable names. Use the Network tab or `GET /events/raw` to confirm that payloads arrive once consent is true.

## 6. Local data collector
The Express server exposes only `/collect-pixel` (GET). Every request is persisted into `data/events.db` as long as it contains:
- `eventType` – accepted values: `page_view`, `add_to_cart`, `checkout`, `purchase`.
- `sessionId` – optional, but recommended for funnel analysis.
- `userId` – optional, used later during enrichment.
- `payload` – JSON string (URL encoded) that includes the ecommerce payload you want to save.

Because the endpoint responds with a 1×1 GIF, it behaves like classic ad-tech pixels: you can issue a simple `Image` request, and the backend captures the data before returning the GIF. Verify inserts via the UI feed, `GET /events/raw`, or by querying the SQLite DB directly.

Quick manual test:

```bash
curl "http://localhost:4000/collect-pixel?eventType=add_to_cart&sessionId=test&payload=%7B%22ecommerce%22:%7B%22items%22:[%7B%22sku%22:%22MS-1001%22%7D]%7D%7D"
```

The command above should return binary GIF data while inserting the event into the database.

## 7. ETL enrichment
After storing a few events, run:

```bash
npm run etl
```

This script merges every raw event with the mock CRM profiles found in `data/user_profiles.json` and writes the result into the `enriched_events` table. Inspect the output through `/events/enriched` or a SQLite client.

### Build your own ETL extension
To mimic an ad-hoc request from analytics stakeholders, you'll also create a second ETL job that appends salutation + phone numbers to the enriched data. Use the source file `data/user_contact_details.json` and decide how to merge it (new columns, separate table, etc.). Expect to explain:
- How the new script is invoked (e.g., `node etl/add_contact_info.js`).
- How conflicts/missing records are handled.
- How to validate that `salutation` and `phone` land in SQLite.

## 8. SQL queries
You can query the database via the sqlite3 CLI:

```bash
npm run query -- "SELECT event_type, COUNT(*) AS total FROM raw_events GROUP BY event_type;"
```

The file `sql/example_queries.sql` contains starting points:
- Event counts per type.
- Revenue per loyalty status (using JSON extraction).
- Checkout sessions without purchases.
- Products added vs purchased for `user-401`.
- CRM users without events.
- **Your custom ETL verification** – after adding salutation/phone, write a query demonstrating those fields were ingested (e.g., select `user_id`, `salutation`, `phone` from your new table or columns).

Prepare to discuss how you would extend these queries to answer business questions.

## 9. Deliverables checklist
- [ ] GTM snippet inserted and publishing works locally.
- [ ] Custom HTML tag(s) send the three ecommerce events to `/collect-pixel` but only when consent is granted and a user is logged in.
- [ ] Demonstration that declining consent blocks network calls.
- [ ] `npm run etl` completes and `enriched_events` contains the expected user attributes.
- [ ] A second ETL process enriches users with salutation & phone number from `data/user_contact_details.json`.
- [ ] At least one SQL query that surfaces an insight from either table (can be run live).

Use git commits or personal notes to track your progress; you'll walk the interviewer through your setup at the end. Good luck!

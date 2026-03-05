-- Inspect how many events have been collected per type
SELECT event_type, COUNT(*) AS total_events
FROM raw_events
GROUP BY event_type
ORDER BY total_events DESC;

-- Revenue breakdown by loyalty status (requires enriched table + JSON1 extension)
SELECT
  COALESCE(loyalty_status, 'unknown') AS loyalty_status,
  ROUND(SUM(json_extract(payload, '$.ecommerce.revenue')), 2) AS revenue
FROM enriched_events
WHERE event_type = 'purchase'
GROUP BY loyalty_status
ORDER BY revenue DESC;

-- Products added vs purchased for the active storefront user (user-401)
WITH user_events AS (
  SELECT
    event_type,
    json_extract(value, '$.sku') AS sku,
    json_extract(value, '$.name') AS name
  FROM enriched_events,
       json_each(json_extract(payload, '$.ecommerce.items'))
  WHERE user_id = 'user-401'
)
SELECT
  sku,
  name,
  SUM(CASE WHEN event_type = 'add_to_cart' THEN 1 ELSE 0 END) AS add_to_cart_count,
  SUM(CASE WHEN event_type = 'purchase' THEN 1 ELSE 0 END) AS purchase_count
FROM user_events
GROUP BY sku, name
ORDER BY sku;

-- Investigate users that started checkout but never purchased
SELECT DISTINCT
  COALESCE(user_email, 'unknown') AS email,
  session_id
FROM enriched_events
WHERE event_type = 'checkout'
  AND session_id NOT IN (
    SELECT session_id FROM enriched_events WHERE event_type = 'purchase'
  );

-- Users in CRM without any recorded events
SELECT
  profiles.id,
  profiles.email,
  profiles.loyalty_status
FROM json_each(readfile('data/user_profiles.json')) AS profiles
LEFT JOIN enriched_events ee ON ee.user_id = profiles.value ->> '$.id'
WHERE ee.user_id IS NULL;

-- Check user_contact_enriched was properly created
SELECT *
FROM user_contact_enriched;

-- Merge contact details with enriched_events
SELECT 
  ee.raw_event_id,
  ee.user_id,
  ee.event_type,
  ee.user_email,
  uce.phone,
  uce.salutation
FROM enriched_events ee
LEFT JOIN user_contact_enriched uce ON ee.user_id = uce.user_id
ORDER BY ee.user_id

-- Count how many enriched events per user in user_contact_enriched
SELECT
  uce.user_id,
  uce.user_email,
  count(ee.raw_event_id) AS total_events
FROM user_contact_enriched uce
LEFT JOIN enriched_events ee ON uce.user_id = ee.user_id
GROUP BY uce.user_id, uce.user_email
ORDER BY total_events DESC;

-- Count how many sessions per user had both add_to_cart and purchase events
SELECT
  ee.user_id,
  uce.user_email,
  COUNT(*) AS sessions_with_add_and_purchase
FROM (
  SELECT user_id, session_id
  FROM enriched_events
  WHERE event_type IN ('add_to_cart', 'purchase')
  GROUP BY user_id, session_id
  HAVING COUNT(DISTINCT event_type) = 2
) ee
LEFT JOIN user_contact_enriched uce ON uce.user_id = ee.user_id
GROUP BY ee.user_id, uce.user_email
ORDER BY sessions_with_add_and_purchase DESC;



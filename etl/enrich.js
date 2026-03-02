const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'events.db');
const USER_DATA_PATH = path.join(__dirname, '..', 'data', 'user_profiles.json');

if (!fs.existsSync(DB_PATH)) {
  console.error('No events database found. Start the server and send a few events first.');
  process.exit(1);
}

const db = new Database(DB_PATH);
const userProfiles = JSON.parse(fs.readFileSync(USER_DATA_PATH, 'utf-8'));
const userMap = new Map(userProfiles.map((profile) => [profile.id, profile]));

const selectRaw = db.prepare('SELECT * FROM raw_events ORDER BY id');
const upsertEnriched = db.prepare(`
  INSERT INTO enriched_events (
    raw_event_id,
    event_type,
    session_id,
    user_id,
    payload,
    user_email,
    loyalty_status,
    country,
    created_at
  ) VALUES (@raw_event_id, @event_type, @session_id, @user_id, @payload, @user_email, @loyalty_status, @country, @created_at)
`);

const truncate = db.prepare('DELETE FROM enriched_events');

function deriveUserData(row) {
  const payload = JSON.parse(row.payload);
  const payloadUser = payload.user || {};
  const targetUserId = row.user_id || payloadUser.id;
  const base = userMap.get(targetUserId);

  return {
    user_id: targetUserId || null,
    user_email: base?.email || payloadUser.email || null,
    loyalty_status: base?.loyalty_status || null,
    country: base?.country || null,
    payload
  };
}

function run() {
  const rows = selectRaw.all();
  if (!rows.length) {
    console.warn('No events were found. Nothing to enrich.');
    return;
  }

  const insertMany = db.transaction((records) => {
    truncate.run();
    records.forEach((record) => upsertEnriched.run(record));
  });

  const enrichedRecords = rows.map((row) => {
    const userData = deriveUserData(row);
    return {
      raw_event_id: row.id,
      event_type: row.event_type,
      session_id: row.session_id,
      user_id: userData.user_id,
      payload: JSON.stringify(userData.payload),
      user_email: userData.user_email,
      loyalty_status: userData.loyalty_status,
      country: userData.country,
      created_at: row.created_at
    };
  });

  insertMany(enrichedRecords);
  console.log(`Enriched ${enrichedRecords.length} events.`);
}

run();

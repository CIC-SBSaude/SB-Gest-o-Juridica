import pg from 'pg';

const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 57322,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
});

async function main() {
  const { rows } = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users'
    ORDER BY ordinal_position;
  `);
  console.log('Columns of auth.users:');
  for (const r of rows) {
    console.log(`- ${r.column_name} (${r.data_type}, nullable: ${r.is_nullable})`);
  }

  // Update all varchar/text columns that GoTrue v2.196.0 expects non-null string
  await pool.query(`
    UPDATE auth.users
    SET confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        reauthentication_token = COALESCE(reauthentication_token, ''),
        phone_change = COALESCE(phone_change, ''),
        phone_change_token = COALESCE(phone_change_token, '')
  `);
  console.log('Updated all GoTrue string fields in auth.users.');
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

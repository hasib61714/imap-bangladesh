const pool = require('../db');

async function check() {
  // Check all users
  const [users] = await pool.query('SELECT id, name, phone, role, is_active FROM users ORDER BY joined_at DESC');
  console.log('\n=== USERS ===');
  users.forEach(u => console.log(JSON.stringify(u)));

  // Check providers table
  const [provs] = await pool.query('SELECT p.id, p.user_id, u.name FROM providers p LEFT JOIN users u ON u.id = p.user_id');
  console.log('\n=== PROVIDERS TABLE ===');
  provs.forEach(p => console.log(JSON.stringify(p)));

  // Check if provider users without providers row
  const [missing] = await pool.query(`
    SELECT u.id, u.name, u.role FROM users u
    LEFT JOIN providers p ON p.user_id = u.id
    WHERE u.role = 'provider' AND p.id IS NULL
  `);
  console.log('\n=== PROVIDERS WITHOUT providers ROW ===');
  missing.forEach(m => console.log(JSON.stringify(m)));

  pool.end();
}

check().catch(e => { console.error(e.message); pool.end(); });

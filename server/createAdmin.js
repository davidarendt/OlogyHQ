const bcrypt = require('bcrypt');
const pool = require('./db');

async function createAdmin() {
  const hashedPassword = await bcrypt.hash('Olog323!', 10);
  
  await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
    ['David Arendt', 'david@ologybrewing.com', hashedPassword, 'admin']
  );

  console.log('Admin user created!');
  process.exit();
}

createAdmin();
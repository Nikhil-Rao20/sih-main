#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function setupDatabase() {
  console.log('🔧 Setting up SIH Portal Database...');
  
  // Open database
  const db = await open({
    filename: process.env.DATABASE_PATH || './data.sqlite',
    driver: sqlite3.Database
  });

  // Enable security features
  await db.exec('PRAGMA foreign_keys = ON');
  await db.exec('PRAGMA journal_mode = WAL');
  await db.exec('PRAGMA synchronous = NORMAL');
  await db.exec('PRAGMA cache_size = 10000');
  await db.exec('PRAGMA temp_store = MEMORY');

  console.log('✅ Database security features enabled');

  // Create admin user if not exists
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'SIH2025@Admin!';

  const existingAdmin = await db.get(
    'SELECT admin_id FROM admins WHERE username = ?',
    [adminUsername]
  );

  if (!existingAdmin) {
    const adminId = `admin_${crypto.randomBytes(8).toString('hex')}`;
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await db.run(
      'INSERT INTO admins (admin_id, username, password_hash, full_name, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
      [adminId, adminUsername, hashedPassword, 'System Administrator']
    );

    console.log(`✅ Admin user created: ${adminUsername}`);
    console.log(`🔑 Admin ID: ${adminId}`);
    console.log(`⚠️  Please change the default password!`);
  } else {
    console.log('ℹ️  Admin user already exists');
  }

  // Create sample jury users for testing
  const sampleJuries = [
    { username: 'jury1', name: 'Dr. John Smith', expertise: 'AI/ML' },
    { username: 'jury2', name: 'Prof. Sarah Johnson', expertise: 'Cybersecurity' },
    { username: 'jury3', name: 'Mr. Rahul Gupta', expertise: 'IoT/Hardware' }
  ];

  for (const jury of sampleJuries) {
    const existing = await db.get(
      'SELECT jury_id FROM juries WHERE username = ?',
      [jury.username]
    );

    if (!existing) {
      const juryId = `jury_${crypto.randomBytes(8).toString('hex')}`;
      const defaultPassword = 'Jury@2025';
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);

      await db.run(
        'INSERT INTO juries (jury_id, username, password_hash, full_name, expertise, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
        [juryId, jury.username, hashedPassword, jury.name, jury.expertise]
      );

      console.log(`✅ Sample jury created: ${jury.username} (${jury.name})`);
    }
  }

  // Show some stats
  const [adminCount, juryCount, submissionCount] = await Promise.all([
    db.get('SELECT COUNT(*) as count FROM admins'),
    db.get('SELECT COUNT(*) as count FROM juries'),
    db.get('SELECT COUNT(*) as count FROM submissions')
  ]);

  console.log('\n📊 Database Status:');
  console.log(`   Admins: ${adminCount.count}`);
  console.log(`   Juries: ${juryCount.count}`);
  console.log(`   Submissions: ${submissionCount.count}`);

  await db.close();
  console.log('\n🎉 Database setup complete!');
  console.log('\n🚀 You can now start the server with: npm start');
  console.log('\n⚠️  IMPORTANT: Change default passwords before production deployment!');
}

setupDatabase().catch(err => {
  console.error('❌ Database setup failed:', err);
  process.exit(1);
});
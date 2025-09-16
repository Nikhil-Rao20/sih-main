#!/usr/bin/env node
// Quick test script to verify MongoDB connection and basic functionality

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'sih_portal_test';

console.log('🧪 Testing MongoDB Connection...');
console.log(`📡 URL: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials
console.log(`🗄️ Database: ${dbName}`);

async function testConnection() {
  let client;
  try {
    // Connect to MongoDB
    client = new MongoClient(mongoUrl);
    await client.connect();
    console.log('✅ MongoDB connection successful!');
    
    // Test database operations
    const db = client.db(dbName);
    
    // Test collections
    const testData = { test: 'data', timestamp: new Date() };
    const testCollection = db.collection('connection_test');
    
    // Insert test data
    await testCollection.insertOne(testData);
    console.log('✅ Test data inserted successfully!');
    
    // Read test data
    const result = await testCollection.findOne({ test: 'data' });
    console.log('✅ Test data read successfully!', result);
    
    // Cleanup test data
    await testCollection.deleteOne({ test: 'data' });
    console.log('✅ Test data cleaned up!');
    
    console.log('\n🎉 All tests passed! Your MongoDB setup is ready!');
    console.log('🚀 You can now run: npm run dev');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    
    if (error.message.includes('authentication failed')) {
      console.log('\n💡 Fix: Check your username/password in MONGODB_URI');
    } else if (error.message.includes('network')) {
      console.log('\n💡 Fix: Check your internet connection and whitelist IP in MongoDB Atlas');
    } else {
      console.log('\n💡 Fix: Verify your MONGODB_URI in .env file');
    }
    
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

testConnection();
# 🧪 Local Testing Guide - SIH Web Portal

Follow these steps to test your application locally before deployment.

## 📋 Prerequisites
- Node.js (you already have this)
- Internet connection for MongoDB Atlas

## 🎯 Step 1: Set Up Database (5 minutes)

### Option A: MongoDB Atlas (Recommended)
1. Go to https://cloud.mongodb.com
2. Create a free account
3. Create new project: "SIH Portal Test"
4. Create cluster: Choose "M0 Sandbox" (FREE)
5. Create database user:
   - Username: `sih_test_user`
   - Password: `sih123456` (or generate one)
6. Network Access: Add IP `0.0.0.0/0` (allow all)
7. Get connection string: `mongodb+srv://sih_test_user:sih123456@cluster0.xxxxx.mongodb.net/`

### Option B: Local MongoDB (Advanced)
If you want to install MongoDB locally:
```bash
# Download from: https://www.mongodb.com/try/download/community
# Follow installation guide for Windows
```

## 🔧 Step 2: Configure Environment

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit .env file with your MongoDB details:**
   ```bash
   MONGODB_URI=mongodb+srv://sih_test_user:sih123456@cluster0.xxxxx.mongodb.net/
   MONGODB_DB=sih_portal_test
   NODE_ENV=development
   PORT=10000
   ```

## ✅ Step 3: Test Database Connection

```bash
# Run connection test
node test-connection.js
```

**Expected output:**
```
🧪 Testing MongoDB Connection...
✅ MongoDB connection successful!
✅ Test data inserted successfully!
✅ Test data read successfully!
✅ Test data cleaned up!
🎉 All tests passed! Your MongoDB setup is ready!
```

## 🚀 Step 4: Start Backend Server

```bash
# Install dependencies (if not done)
npm install

# Start development server
npm run dev
```

**Expected output:**
```
📊 MongoDB connection established
✅ Database initialized successfully
🚀 Server running on http://localhost:10000
📊 Health check: http://localhost:10000/api/health
🌍 Environment: development
🗄️ Database: MongoDB
```

## 🧪 Step 5: Test API Endpoints

### Health Check
```bash
# In browser or curl:
http://localhost:10000/api/health
```
**Expected:** `{"status":"ok","message":"SIH Backend API is running",...}`

### Problem Statements
```bash
http://localhost:10000/api/problems
```
**Expected:** Array of problem statements

### Juries List
```bash
http://localhost:10000/api/admin/juries
```
**Expected:** Array of seed jury data

## 🌐 Step 6: Test Frontend Integration

1. **Start frontend (separate terminal):**
   ```bash
   cd ../  # Go to project root
   npm run dev
   ```

2. **Open in browser:**
   ```
   http://localhost:5177
   ```

3. **Test features:**
   - ✅ Landing page loads
   - ✅ Submit form works
   - ✅ Admin panel accessible
   - ✅ Jury management works

## 🔍 Step 7: Test Data Operations

### Test Team Submission
1. Go to http://localhost:5177
2. Fill out submission form:
   - Team ID: `001_SIH`
   - Team Name: `Test Team`
   - Leader: `Test Leader`
   - Leader ID: `TEST001`
   - Phone: `9999999999`
   - Problem Code: `SIH1727`
   - Slides Link: `https://docs.google.com/presentation/test`
3. Submit and verify success

### Test Admin Panel
1. Go to http://localhost:5177/admin
2. Check submissions list
3. Try jury management
4. Test jury assignments

### Test Jury Login
1. Go to http://localhost:5177/jury
2. Try login with seed jury:
   - Email: `jury1@sih2025.com`
   - Password: Leave empty (demo jury)

## 🐛 Common Issues & Fixes

### Issue: "Connection failed"
**Fix:** Check MONGODB_URI in .env file

### Issue: "Authentication failed"
**Fix:** Verify username/password in MongoDB Atlas

### Issue: "Network timeout"
**Fix:** Check IP whitelist in MongoDB Atlas (0.0.0.0/0)

### Issue: "Port already in use"
**Fix:** Change PORT in .env to different number (e.g., 10001)

### Issue: Frontend can't connect to backend
**Fix:** Ensure backend is running on port 10000

## ✅ Success Criteria

Before moving to deployment, verify:
- [ ] Database connection works
- [ ] Server starts without errors
- [ ] All API endpoints respond
- [ ] Frontend loads and connects to backend
- [ ] Form submissions work
- [ ] Admin panel functions properly
- [ ] Data persists after server restart

## 🚀 Ready for Deployment?

If all tests pass, your application is ready for production deployment!

Next: Follow MONGODB_DEPLOYMENT.md for production setup.
# 🚀 Complete MongoDB + Render Deployment Guide - SIH Web Portal

## 🎯 Architecture Overview

```
Frontend (Render Web Service) ←→ Backend (Render Web Service) ←→ MongoDB Atlas
     [Node.js + Express]           [Node.js + Express]           [Cloud Database]
```

## 📋 Prerequisites

1. ✅ **MongoDB Atlas Account** - Free tier at mongodb.com/atlas
2. ✅ **Render Account** - Free account at render.com
3. ✅ **GitHub Repository** - Your updated code

## 🗄️ Step 1: Setup MongoDB Atlas

### Create MongoDB Cluster:
1. **Go to [MongoDB Atlas](https://www.mongodb.com/atlas)**
2. **Sign up/Login** → Create free cluster
3. **Choose AWS** → Select closest region (e.g., Mumbai for India)
4. **Cluster Name**: `sih-cluster`
5. **Wait for cluster creation** (2-3 minutes)

### Configure Database Access:
1. **Database Access** → Add Database User
   - **Username**: `sih_admin`
   - **Password**: Generate secure password (save it!)
   - **Role**: Atlas Admin

2. **Network Access** → Add IP Address
   - **Add**: `0.0.0.0/0` (Allow access from anywhere)
   - **Comment**: "Render deployment access"

### Get Connection String:
1. **Clusters** → Connect → Connect your application
2. **Driver**: Node.js
3. **Copy connection string**: 
   ```
   mongodb+srv://sih_admin:<password>@sih-cluster.xxxxx.mongodb.net/
   ```
4. **Replace `<password>`** with your actual password

## 🚀 Step 2: Deploy Backend on Render

1. **Login to Render** → New + → Web Service
2. **Connect GitHub** → Select your repository
3. **Service Configuration:**
   ```
   Name: sih-backend
   Root Directory: server
   Environment: Node
   Build Command: npm install
   Start Command: node index-mongodb.js
   Instance Type: Free
   ```

4. **Environment Variables:**
   ```
   NODE_ENV=production
   PORT=10000
   MONGODB_URI=mongodb+srv://sih_admin:YOUR_PASSWORD@sih-cluster.xxxxx.mongodb.net/
   MONGODB_DB=sih_portal
   ADMIN_EMAIL=admin@rgukt.ac.in
   ADMIN_PASSWORD=SIH2024@Admin
   ```

5. **Deploy** → Wait for "Live" status

## 🌐 Step 3: Deploy Frontend on Render

1. **New + → Web Service** (same repo)
2. **Service Configuration:**
   ```
   Name: sih-frontend
   Root Directory: / (leave empty)
   Environment: Node
   Build Command: npm install && npm run build
   Start Command: npm start
   Instance Type: Free
   ```

3. **Environment Variables:**
   ```
   NODE_ENV=production
   PORT=10000
   VITE_API_BASE=/api
   BACKEND_URL=https://sih-backend.onrender.com
   ```

4. **Deploy** → Wait for "Live" status

## 🧪 Step 4: Test Your Deployment

### URLs You'll Get:
- **Frontend**: `https://sih-frontend.onrender.com`
- **Backend**: `https://sih-backend.onrender.com`
- **Health Check**: `https://sih-backend.onrender.com/api/health`

### Test Checklist:
1. **✅ Landing Page** - RGUKT branding loads correctly
2. **✅ Admin Login** - `admin@rgukt.ac.in` / `SIH2024@Admin`
3. **✅ Jury Management** - Add/edit juries (no more 404 errors!)
4. **✅ Team Registration** - Submit presentations
5. **✅ Jury Login** - Demo accounts work
6. **✅ Database Persistence** - Data survives server restarts

## 🔐 Login Credentials

### Admin Panel:
- **Email**: `admin@rgukt.ac.in`
- **Password**: `SIH2024@Admin`

### Demo Juries:
- `jury1@sih2025.com` / `jury1pass`
- `jury2@sih2025.com` / `jury2pass`
- `jury3@sih2025.com` / `jury3pass`
- `jury4@sih2025.com` / `jury4pass`

## 💰 Cost Breakdown (FREE!)

### MongoDB Atlas:
- ✅ **512 MB storage** - plenty for your portal
- ✅ **No time limits** - runs 24/7
- ✅ **Shared cluster** - perfect for development

### Render:
- ✅ **500 build hours/month** - more than enough
- ✅ **750 compute hours/month** - plenty for both services
- ✅ **No sleeping** - both services stay active

## 📊 MongoDB Collections Created

Your database will automatically create these collections:

1. **teams** - Team information and registration data
2. **juries** - Jury members and their credentials
3. **jury_assignments** - Which juries evaluate which teams
4. **submissions** - Team presentation submissions
5. **evaluations** - Jury scores and feedback

## 🔧 Advanced Configuration

### Custom Domain (Optional):
1. **Render** → Your service → Settings → Custom Domain
2. **Add your domain** → Follow DNS instructions

### MongoDB Monitoring:
1. **Atlas** → Clusters → Metrics
2. **View connection counts, operations, storage usage**

### Backup Strategy:
- **Atlas automatically backs up** your data
- **Point-in-time recovery** available
- **No manual backup needed**

## 🐛 Troubleshooting

### Common Issues:

1. **"Connection refused to MongoDB"**
   - ✅ Check MONGODB_URI format
   - ✅ Verify password in connection string
   - ✅ Ensure IP whitelist includes 0.0.0.0/0

2. **"Backend connection failed"**
   - ✅ Check backend service is "Live" on Render
   - ✅ Verify BACKEND_URL in frontend environment

3. **"Authentication failed"**
   - ✅ Check MongoDB username/password
   - ✅ Verify database user permissions

4. **"Slow first load"**
   - ✅ Normal for free tier - first request takes 15-30 seconds
   - ✅ Subsequent requests are fast

## 🎉 What You Get

### Complete SIH Portal Features:
- ✅ **Team Registration** - With problem statement selection
- ✅ **Admin Dashboard** - Full jury and submission management
- ✅ **Jury Portal** - Evaluation and scoring system
- ✅ **Real-time Updates** - All data synced instantly
- ✅ **Responsive Design** - Works on all devices
- ✅ **RGUKT Branding** - University colors and logos
- ✅ **Persistent Database** - Data never lost
- ✅ **Scalable Architecture** - Can handle thousands of users

### Production-Ready Security:
- ✅ **Password hashing** with scrypt
- ✅ **Input validation** with Zod schemas
- ✅ **CORS protection** configured
- ✅ **Rate limiting** and helmet security headers
- ✅ **Environment-based configuration**

## 📈 Next Steps

1. **Test thoroughly** - Register teams, evaluate submissions
2. **Add custom domain** - Use your university domain
3. **Monitor usage** - Check MongoDB Atlas metrics
4. **Scale if needed** - Upgrade to paid tiers for more resources

Your SIH Web Portal is now production-ready with MongoDB! 🚀

## 🆘 Support

If you encounter issues:
1. **Check Render logs** - View detailed error messages
2. **Monitor MongoDB** - Atlas provides connection logs
3. **Health endpoints** - Use `/api/health` for debugging
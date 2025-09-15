# SIH Portal - Secure Deployment Guide

## 🔒 Security Features

This application now includes comprehensive security measures:

### Authentication & Authorization
- **JWT-based authentication** for admin and jury users
- **Role-based access control** (admin, jury, participant)
- **Password hashing** with bcrypt (12 rounds)
- **Account lockout** after 5 failed login attempts (30-minute lock)

### Security Middleware
- **Rate limiting** on all endpoints
- **CORS protection** with configurable origins
- **Input sanitization** to prevent XSS attacks
- **SQL injection protection** with parameterized queries
- **Security headers** via Helmet.js

### Audit & Monitoring
- **Comprehensive audit logging** for all sensitive operations
- **Failed login attempt tracking**
- **Database activity monitoring**
- **IP address logging** for all requests

## 🚀 Deployment Instructions

### 1. Backend Deployment (Railway/Render)

#### Option A: Railway Deployment
1. **Create Railway Account**: Go to [railway.app](https://railway.app)
2. **Connect GitHub**: Link your repository
3. **Create New Project**: Select your repo
4. **Environment Variables**: Add these in Railway dashboard:
   ```bash
   NODE_ENV=production
   PORT=3001
   DATABASE_URL=sqlite:./data.sqlite
   JWT_SECRET=your-super-secure-jwt-secret-minimum-32-chars
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=YourSecurePassword123!
   CORS_ORIGIN=https://your-netlify-site.netlify.app
   SESSION_SECRET=your-session-secret-32-chars-minimum
   DB_ENCRYPTION_KEY=your-32-character-encryption-key
   SECURITY_ENABLED=true
   ```
5. **Deploy**: Railway will auto-deploy from your repo

#### Option B: Render Deployment
1. **Create Render Account**: Go to [render.com](https://render.com)
2. **New Web Service**: Connect your GitHub repo
3. **Build Command**: `cd server && npm install`
4. **Start Command**: `cd server && node index.js`
5. **Environment Variables**: Same as Railway above

### 2. Frontend Deployment (Netlify)

#### Update API Base URL
1. **Edit `src/api.ts`**:
   ```typescript
   const API_BASE_URL = process.env.NODE_ENV === 'production' 
     ? 'https://your-railway-app.railway.app' 
     : 'http://localhost:3001';
   ```

#### Deploy to Netlify
1. **Build the app**: `npm run build`
2. **Deploy to Netlify**: Drag `dist` folder to Netlify
3. **Set up redirects**: Create `public/_redirects`:
   ```
   /* /index.html 200
   ```

### 3. Security Configuration

#### Strong Passwords
- **Admin Password**: Minimum 12 characters, mixed case, numbers, symbols
- **JWT Secret**: Minimum 32 random characters
- **Encryption Key**: Exactly 32 random characters

#### Environment Security
- **Never commit** `.env` files to version control
- **Use strong secrets** in production
- **Enable HTTPS** on both frontend and backend
- **Set proper CORS origins**

## 🔧 Local Development Setup

### 1. Clone and Install
```bash
git clone <your-repo>
cd project
npm install
cd server && npm install
```

### 2. Environment Setup
```bash
cd server
cp .env.example .env
# Edit .env with your local values
```

### 3. Database Setup
```bash
cd server
node setup.js  # Creates admin user and sample data
```

### 4. Start Development
```bash
# Frontend (from project root)
npm run dev

# Backend (in separate terminal)
cd server
npm start
```

## 🛡️ Security Checklist

### Before Production Deployment:
- [ ] Change all default passwords
- [ ] Generate strong JWT secrets (32+ chars)
- [ ] Set secure CORS origins
- [ ] Enable HTTPS on both domains
- [ ] Review audit logs regularly
- [ ] Set up database backups
- [ ] Monitor failed login attempts
- [ ] Test rate limiting functionality
- [ ] Verify input sanitization

### Default Credentials (CHANGE THESE!):
- **Admin**: `admin` / `SIH2025@Admin!`
- **Sample Juries**: `jury1`, `jury2`, `jury3` / `Jury@2025`

## 📊 API Endpoints

### Public Endpoints
- `GET /api/health` - Health check
- `GET /api/problems` - Problem statements list
- `POST /api/submit` - Team registration (rate limited)
- `GET /api/submissions/:team_id` - Team's submissions

### Admin Endpoints (Auth Required)
- `POST /api/admin/login` - Admin login
- `GET /api/admin/juries` - Manage juries
- `POST /api/admin/juries` - Add jury
- `GET /api/submissions` - All submissions
- `PATCH /api/submissions/:id/presented` - Mark presented
- `DELETE /api/submissions/:id` - Delete submission

### Jury Endpoints (Auth Required)
- `POST /api/jury/login` - Jury login
- `GET /api/jury/:id/assigned-teams` - Assigned teams
- `POST /api/evaluations` - Submit evaluation

## 🔍 Monitoring & Logs

### Audit Logs
All sensitive operations are logged in the `audit_logs` table:
- User authentication attempts
- Admin operations (create/delete)
- Jury evaluations
- Data modifications

### Failed Login Tracking
Failed attempts are tracked in `failed_login_attempts` table:
- Automatic account lockout after 5 failures
- 30-minute lockout duration
- IP address tracking

## 🚨 Troubleshooting

### Common Issues:
1. **CORS Errors**: Update `CORS_ORIGIN` in environment variables
2. **JWT Errors**: Ensure JWT_SECRET is properly set
3. **Database Locked**: Restart server, check file permissions
4. **Rate Limiting**: Wait for rate limit window to reset

### Getting Help:
- Check server logs for detailed error messages
- Verify environment variables are set correctly
- Ensure database file has proper permissions
- Test endpoints with proper authentication headers

## 📝 API Usage Examples

### Frontend Authentication
```typescript
// Login
const response = await fetch('/api/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});

// Authenticated requests
const authResponse = await fetch('/api/admin/juries', {
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

This setup provides enterprise-level security suitable for production hackathon environments!
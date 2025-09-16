import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import { z } from 'zod';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// CORS configuration for production
app.use(cors({
  origin: [
    'https://sih-frontend.onrender.com', // Render frontend
    'http://localhost:5177', // For local development
    'http://localhost:10000', // Local frontend server
    /\.onrender\.com$/, // Allow all render.com subdomains
    /\.netlify\.app$/ // Allow all netlify.app subdomains (fallback)
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'SIH Backend API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    database: 'MongoDB'
  });
});

let db, client;

async function initDb() {
  try {
    // MongoDB connection
    const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const dbName = process.env.MONGODB_DB || 'sih_portal';
    
    client = new MongoClient(mongoUrl);
    await client.connect();
    const database = client.db(dbName);
    
    // Collections
    db = {
      teams: database.collection('teams'),
      juries: database.collection('juries'),
      jury_assignments: database.collection('jury_assignments'),
      submissions: database.collection('submissions'),
      evaluations: database.collection('evaluations'),
    };

    // Create indexes for better performance
    await db.teams.createIndex({ team_id: 1 }, { unique: true });
    await db.juries.createIndex({ jury_id: 1 }, { unique: true });
    await db.juries.createIndex({ email: 1 });
    await db.jury_assignments.createIndex({ team_id: 1, jury_id: 1 }, { unique: true });
    await db.submissions.createIndex({ team_id: 1 });
    await db.submissions.createIndex({ created_at: -1 });
    await db.evaluations.createIndex({ team_id: 1, jury_id: 1 }, { unique: true });

    console.log('📊 MongoDB connection established');
    await seedInitialData();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function seedInitialData() {
  // Seed dummy juries if none exist
  const juryCount = await db.juries.countDocuments();
  if (juryCount === 0) {
    const seed = [
      { jury_id: 'CSE01', name: 'Dr. A CSE', email: 'cse01@rgukt.ac.in', department: 'CSE' },
      { jury_id: 'CSE02', name: 'Dr. B CSE', email: 'cse02@rgukt.ac.in', department: 'CSE' },
      { jury_id: 'CSE03', name: 'Dr. C CSE', email: 'cse03@rgukt.ac.in', department: 'CSE' },
      { jury_id: 'ECE01', name: 'Dr. A ECE', email: 'ece01@rgukt.ac.in', department: 'ECE' },
      { jury_id: 'ECE02', name: 'Dr. B ECE', email: 'ece02@rgukt.ac.in', department: 'ECE' },
      { jury_id: 'EEE01', name: 'Dr. A EEE', email: 'eee01@rgukt.ac.in', department: 'EEE' },
      { jury_id: 'EEE02', name: 'Dr. B EEE', email: 'eee02@rgukt.ac.in', department: 'EEE' },
      { jury_id: 'ME01', name: 'Dr. A ME', email: 'me01@rgukt.ac.in', department: 'Mechanical' },
      { jury_id: 'ME02', name: 'Dr. B ME', email: 'me02@rgukt.ac.in', department: 'Mechanical' },
      { jury_id: 'jury1', name: 'Demo Jury 1', email: 'jury1@sih2025.com', department: 'CSE' },
      { jury_id: 'jury2', name: 'Demo Jury 2', email: 'jury2@sih2025.com', department: 'ECE' },
      { jury_id: 'jury3', name: 'Demo Jury 3', email: 'jury3@sih2025.com', department: 'EEE' },
      { jury_id: 'jury4', name: 'Demo Jury 4', email: 'jury4@sih2025.com', department: 'Mechanical' }
    ];
    
    await db.juries.insertMany(seed);
    console.log('🌱 Seeded initial jury data');
  }

  // Set default passwords for demo juries
  try {
    const demoPwds = [
      { email: 'jury1@sih2025.com', pass: 'jury1pass' },
      { email: 'jury2@sih2025.com', pass: 'jury2pass' },
      { email: 'jury3@sih2025.com', pass: 'jury3pass' },
      { email: 'jury4@sih2025.com', pass: 'jury4pass' }
    ];
    
    for (const { email, pass } of demoPwds) {
      const jury = await db.juries.findOne({ email });
      if (jury && (!jury.password_hash || jury.password_hash.trim() === '')) {
        const hashed = hashPassword(pass);
        await db.juries.updateOne(
          { email },
          { $set: { password_hash: hashed } }
        );
      }
    }
    console.log('🔑 Demo jury passwords set');
  } catch (e) {
    console.error('Failed to set demo passwords:', e);
  }
}

// Password helpers (scrypt)
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hashHex, 'hex'), derived);
}

function isAllowedProblemCode(code) {
  if (!/^SIH\d{5}$/.test(code)) return false;
  const num = Number(code.slice(3));
  if (num >= 25001 && num <= 25142) return true;
  return num === 12507 || num === 12508;
}

// Validation schemas
const submissionSchema = z.object({
  team_id: z.string().regex(/^\d{3}_SIH$/i, 'Team ID must match 001_SIH format'),
  team_name: z.string().min(2, 'Team name must be at least 2 characters'),
  leader_name: z.string().min(2, 'Leader name must be at least 2 characters'),
  leader_id: z.string().min(2, 'Leader ID must be at least 2 characters'),
  phone: z.string().regex(/^[0-9]{10}$/, 'Phone must be 10 digits'),
  problem_code: z.string().refine(isAllowedProblemCode, 'Invalid Problem Statement ID'),
  slides_link: z.string().url('Must be a valid URL')
});

const evaluationSchema = z.object({
  team_id: z.string().min(1),
  jury_id: z.string().min(1),
  ppt_design: z.number().int().min(1).max(10),
  idea: z.number().int().min(1).max(10),
  pitching: z.number().int().min(1).max(10),
  project_impact: z.number().int().min(1).max(10),
  remarks: z.string().optional()
});

const juryUpsertSchema = z.object({
  jury_id: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')).transform(v => v || null),
  department: z.string().min(2),
  password: z.string().min(4).optional().or(z.literal('')).transform(v => v || undefined)
});

// API Routes

// Get problem statements
app.get('/api/problems', async (req, res) => {
  try {
    const codes = [];
    for (let n = 25001; n <= 25142; n++) codes.push(`SIH${n}`);
    codes.push('SIH12507', 'SIH12508');
    const items = codes.map(code => ({ 
      code, 
      title: `Problem Statement ${code.slice(3)} - Innovation Challenge` 
    }));
    res.json(items);
  } catch (error) {
    console.error('Error fetching problems:', error);
    res.status(500).json({ error: 'Failed to fetch problem statements' });
  }
});

// Submit team registration
app.post('/api/submit', async (req, res) => {
  try {
    const parsed = submissionSchema.parse(req.body);

    // Upsert team
    await db.teams.updateOne(
      { team_id: parsed.team_id },
      { 
        $set: {
          team_id: parsed.team_id,
          team_name: parsed.team_name,
          leader_name: parsed.leader_name,
          leader_id: parsed.leader_id,
          phone: parsed.phone
        }
      },
      { upsert: true }
    );

    // Check submission limit (max 2 per team)
    const submissionCount = await db.submissions.countDocuments({ team_id: parsed.team_id });
    if (submissionCount >= 2) {
      return res.status(400).json({ 
        error: 'Submission limit reached. Only 2 problem statements allowed per team.' 
      });
    }

    const numericId = Number(parsed.problem_code.slice(3));
    await db.submissions.insertOne({
      team_id: parsed.team_id,
      problem_id: isFinite(numericId) ? numericId : 0,
      problem_code: parsed.problem_code,
      slides_link: parsed.slides_link,
      created_at: new Date().toISOString(),
      presented: false
    });

    // Auto-assign 2-3 juries randomly if none assigned yet
    const existingAssignment = await db.jury_assignments.findOne({ team_id: parsed.team_id });
    if (!existingAssignment) {
      const juries = await db.juries.aggregate([{ $sample: { size: 3 } }]).toArray();
      const pickCount = Math.max(2, Math.min(3, juries.length));
      const picked = juries.slice(0, pickCount);
      
      const assignments = picked.map(jury => ({
        team_id: parsed.team_id,
        jury_id: jury.jury_id
      }));
      
      try {
        await db.jury_assignments.insertMany(assignments, { ordered: false });
      } catch (e) {
        // Ignore duplicate key errors
        if (e.code !== 11000) throw e;
      }
    }

    res.json({
      success: true,
      message: `Successfully submitted presentation for Problem Statement ${parsed.problem_code}`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ 
        error: err.errors.map(e => e.message).join(', ') 
      });
    }
    console.error('Submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get submissions for a team
app.get('/api/submissions/:team_id', async (req, res) => {
  try {
    const { team_id } = req.params;
    const submissions = await db.submissions.find({ team_id })
      .sort({ created_at: -1 })
      .toArray();
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching team submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// List all submissions (admin)
app.get('/api/submissions', async (req, res) => {
  try {
    const { search = '', sort = 'problem_id', order = 'asc' } = req.query;
    const validSort = ['problem_id', 'created_at', 'team_id'];
    const sortBy = validSort.includes(String(sort)) ? String(sort) : 'problem_id';
    const sortOrder = String(order).toLowerCase() === 'desc' ? -1 : 1;
    const searchRegex = new RegExp(String(search), 'i');
    
    const pipeline = [
      {
        $lookup: {
          from: 'teams',
          localField: 'team_id',
          foreignField: 'team_id',
          as: 'team'
        }
      },
      { $unwind: '$team' },
      {
        $match: {
          $or: [
            { team_id: searchRegex },
            { 'team.team_name': searchRegex },
            { problem_code: searchRegex }
          ]
        }
      },
      {
        $project: {
          id: '$_id',
          team_id: 1,
          team_name: '$team.team_name',
          leader_name: '$team.leader_name',
          leader_id: '$team.leader_id',
          phone: '$team.phone',
          problem_id: 1,
          problem_code: 1,
          slides_link: 1,
          presented: 1,
          created_at: 1
        }
      },
      { $sort: { [sortBy]: sortOrder, created_at: -1 } }
    ];
    
    const rows = await db.submissions.aggregate(pipeline).toArray();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Mark submission as presented
app.patch('/api/submissions/:id/presented', async (req, res) => {
  try {
    const { id } = req.params;
    await db.submissions.updateOne(
      { _id: new ObjectId(id) },
      { $set: { presented: true } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating presentation status:', error);
    res.status(500).json({ error: 'Failed to update presentation status' });
  }
});

// Delete submission
app.delete('/api/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get submission details before deletion for logging
    const submission = await db.submissions.findOne({ _id: new ObjectId(id) });
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    // Delete the submission
    await db.submissions.deleteOne({ _id: new ObjectId(id) });
    
    console.log(`Submission deleted: ${id} (Team: ${submission.team_id})`);
    res.json({ success: true, message: 'Submission deleted successfully' });
  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

// Save jury evaluation
app.post('/api/evaluations', async (req, res) => {
  try {
    const e = evaluationSchema.parse(req.body);
    
    // Verify jury exists and is assigned to team
    const juryExists = await db.juries.findOne({ jury_id: e.jury_id });
    if (!juryExists) return res.status(403).json({ error: 'Unknown jury' });
    
    const assigned = await db.jury_assignments.findOne({
      team_id: e.team_id,
      jury_id: e.jury_id
    });
    if (!assigned) return res.status(403).json({ error: 'Jury not assigned to this team' });
    
    const total = (e.ppt_design + e.idea + e.pitching + e.project_impact) / 4;
    
    await db.evaluations.updateOne(
      { team_id: e.team_id, jury_id: e.jury_id },
      {
        $set: {
          team_id: e.team_id,
          jury_id: e.jury_id,
          ppt_design: e.ppt_design,
          idea: e.idea,
          pitching: e.pitching,
          project_impact: e.project_impact,
          remarks: e.remarks || null,
          total_score: total,
          created_at: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    // Auto-mark as presented if all assigned juries have evaluated
    const expectedCount = await db.jury_assignments.countDocuments({ team_id: e.team_id });
    const doneCount = await db.evaluations.countDocuments({ team_id: e.team_id });
    
    if (expectedCount > 0 && doneCount >= expectedCount) {
      await db.submissions.updateMany(
        { team_id: e.team_id },
        { $set: { presented: true } }
      );
    }
    
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors.map(e => e.message).join(', ') });
    }
    console.error('Evaluation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin login and scores
const ADMIN_CREDENTIALS = { 
  username: process.env.ADMIN_EMAIL || 'admin', 
  password: process.env.ADMIN_PASSWORD || 'sih2025admin' 
};

app.post('/api/admin/scores', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const pipeline = [
      {
        $lookup: {
          from: 'teams',
          localField: 'team_id',
          foreignField: 'team_id',
          as: 'team'
        }
      },
      { $unwind: '$team' },
      {
        $lookup: {
          from: 'evaluations',
          localField: 'team_id',
          foreignField: 'team_id',
          as: 'evaluations'
        }
      },
      {
        $project: {
          team_id: 1,
          team_name: '$team.team_name',
          problem_id: 1,
          problem_code: 1,
          avg_score: { $avg: '$evaluations.total_score' },
          evaluations_count: { $size: '$evaluations' }
        }
      },
      { $sort: { avg_score: -1 } }
    ];
    
    const summary = await db.submissions.aggregate(pipeline).toArray();
    const perJury = await db.evaluations.find({}, {
      projection: { team_id: 1, jury_id: 1, total_score: 1 }
    }).toArray();
    
    res.json({ summary, perJury });
  } catch (error) {
    console.error('Error fetching admin scores:', error);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

// Jury management
app.get('/api/admin/juries', async (req, res) => {
  try {
    const juries = await db.juries.find({}, {
      projection: { jury_id: 1, name: 1, email: 1, department: 1 }
    }).sort({ department: 1, name: 1 }).toArray();
    res.json(juries);
  } catch (e) {
    console.error('Error fetching juries:', e);
    res.status(500).json({ error: 'Failed to load juries' });
  }
});

app.post('/api/admin/juries', async (req, res) => {
  try {
    const j = juryUpsertSchema.parse(req.body);
    
    const updateData = {
      jury_id: j.jury_id,
      name: j.name,
      email: j.email,
      department: j.department
    };
    
    if (j.password) {
      updateData.password_hash = hashPassword(j.password);
    }
    
    await db.juries.updateOne(
      { jury_id: j.jury_id },
      { $set: updateData },
      { upsert: true }
    );
    
    res.json({ success: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors.map(x => x.message).join(', ') });
    }
    console.error('Error saving jury:', e);
    res.status(500).json({ error: 'Failed to save jury' });
  }
});

app.delete('/api/admin/juries/:jury_id', async (req, res) => {
  try {
    const { jury_id } = req.params;
    
    // Delete jury and all related data (cascade delete)
    await Promise.all([
      db.juries.deleteOne({ jury_id }),
      db.jury_assignments.deleteMany({ jury_id }),
      db.evaluations.deleteMany({ jury_id })
    ]);
    
    res.json({ success: true, message: 'Jury and all related data deleted successfully' });
  } catch (e) {
    console.error('Error deleting jury:', e);
    res.status(500).json({ error: 'Failed to delete jury' });
  }
});

// Jury login
app.post('/api/jury/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const jury = await db.juries.findOne({ email });
    
    if (!jury || !verifyPassword(password, jury.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ 
      jury_id: jury.jury_id, 
      name: jury.name, 
      department: jury.department 
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Jury assignments
app.get('/api/admin/assignments/:jury_id', async (req, res) => {
  try {
    const { jury_id } = req.params;
    const assignments = await db.jury_assignments.find({ jury_id })
      .sort({ team_id: 1 })
      .toArray();
    const teamIds = assignments.map(a => a.team_id);
    res.json(teamIds);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

app.post('/api/admin/assignments/:jury_id', async (req, res) => {
  try {
    const { jury_id } = req.params;
    const { team_ids } = req.body || {};
    
    if (!Array.isArray(team_ids)) {
      return res.status(400).json({ error: 'team_ids array required' });
    }
    
    // Filter only existing team_ids
    const existingTeams = await db.teams.find({
      team_id: { $in: team_ids.map(t => String(t)) }
    }).toArray();
    const validIds = existingTeams.map(t => t.team_id);
    
    // Remove existing assignments for this jury
    await db.jury_assignments.deleteMany({ jury_id });
    
    // Add new assignments
    if (validIds.length > 0) {
      const assignments = validIds.map(team_id => ({ team_id, jury_id }));
      await db.jury_assignments.insertMany(assignments, { ordered: false });
    }
    
    const skipped = team_ids.filter(t => !validIds.includes(String(t)));
    res.json({ success: true, count: validIds.length, skipped });
  } catch (e) {
    console.error('Error saving assignments:', e);
    res.status(500).json({ error: 'Failed to save assignments' });
  }
});

// Import jury mapping from CSV
app.post('/api/admin/jury-mapping', async (req, res) => {
  try {
    const { csv } = req.body || {};
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'CSV data required' });
    }

    const lines = csv.trim().split('\n');
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must have header and at least one data row' });
    }

    // Skip header line
    const dataLines = lines.slice(1);
    let successful = 0;
    let errors = [];
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      if (!line) continue;

      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 2) {
        errors.push(`Line ${i + 2}: Invalid format, expected team_id,jury_id`);
        continue;
      }

      const [team_id, jury_id] = parts;
      
      // Check if team exists
      const teamExists = await db.teams.findOne({ team_id });
      if (!teamExists) {
        errors.push(`Line ${i + 2}: Team ${team_id} not found`);
        continue;
      }

      // Check if jury exists
      const juryExists = await db.juries.findOne({ jury_id });
      if (!juryExists) {
        errors.push(`Line ${i + 2}: Jury ${jury_id} not found`);
        continue;
      }

      // Insert assignment (ignore duplicates)
      try {
        await db.jury_assignments.insertOne({ team_id, jury_id });
        successful++;
      } catch (e) {
        if (e.code === 11000) {
          // Duplicate key error - assignment already exists
          successful++;
        } else {
          throw e;
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Successfully imported ${successful} assignments`,
      successful,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (e) {
    console.error('Error importing jury mapping:', e);
    res.status(500).json({ error: 'Failed to import jury mapping' });
  }
});

// Get assigned teams for jury
app.get('/api/jury/:jury_id/assigned-teams', async (req, res) => {
  try {
    const { jury_id } = req.params;
    
    const exists = await db.juries.findOne({ jury_id });
    if (!exists) return res.status(404).json({ error: 'Jury not found' });
    
    const pipeline = [
      { $match: { jury_id } },
      {
        $lookup: {
          from: 'submissions',
          localField: 'team_id',
          foreignField: 'team_id',
          as: 'submissions'
        }
      },
      { $unwind: '$submissions' },
      {
        $lookup: {
          from: 'teams',
          localField: 'team_id',
          foreignField: 'team_id',
          as: 'team'
        }
      },
      { $unwind: '$team' },
      {
        $lookup: {
          from: 'evaluations',
          let: { team_id: '$team_id', jury_id: jury_id },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ['$team_id', '$$team_id'] },
              { $eq: ['$jury_id', '$$jury_id'] }
            ]}}},
            { $limit: 1 }
          ],
          as: 'evaluation'
        }
      },
      {
        $lookup: {
          from: 'evaluations',
          localField: 'team_id',
          foreignField: 'team_id',
          as: 'all_evaluations'
        }
      },
      {
        $project: {
          team_id: '$team_id',
          team_name: '$team.team_name',
          leader_name: '$team.leader_name',
          leader_id: '$team.leader_id',
          slides_link: '$submissions.slides_link',
          evaluated: { $gt: [{ $size: '$evaluation' }, 0] },
          problem_id: '$submissions.problem_id',
          problem_code: '$submissions.problem_code',
          avg_score: { $avg: '$all_evaluations.total_score' }
        }
      },
      { $sort: { 'submissions.created_at': -1 } }
    ];
    
    const rows = await db.jury_assignments.aggregate(pipeline).toArray();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching assigned teams:', error);
    res.status(500).json({ error: 'Failed to fetch assigned teams' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (client) {
    await client.close();
  }
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    await initDb();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Database: MongoDB`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
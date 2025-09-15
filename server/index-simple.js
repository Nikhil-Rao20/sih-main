import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

let db;

// Initialize database
async function initDb() {
  try {
    db = await open({
      filename: './data.sqlite',
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        team_id TEXT PRIMARY KEY,
        team_name TEXT NOT NULL,
        leader_name TEXT NOT NULL,
        leader_id TEXT NOT NULL,
        phone TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id TEXT NOT NULL,
        problem_id INTEGER,
        problem_code TEXT,
        slides_link TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        presented INTEGER DEFAULT 0,
        FOREIGN KEY (team_id) REFERENCES teams(team_id)
      );

      CREATE TABLE IF NOT EXISTS juries (
        jury_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        department TEXT
      );

      CREATE TABLE IF NOT EXISTS evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id TEXT NOT NULL,
        jury_id TEXT NOT NULL,
        ppt_design INTEGER NOT NULL,
        idea INTEGER NOT NULL,
        pitching INTEGER NOT NULL,
        project_impact INTEGER NOT NULL,
        remarks TEXT,
        total_score REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team_id, jury_id)
      );
    `);
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Validation schemas
const submissionSchema = z.object({
  team_id: z.string().regex(/^\d{3}_SIH$/i),
  team_name: z.string().min(2),
  leader_name: z.string().min(2),
  leader_id: z.string().min(2),
  phone: z.string().regex(/^[0-9]{10}$/),
  problem_code: z.string(),
  slides_link: z.string().url()
});

// Helper function to check allowed problem codes
function isAllowedProblemCode(code) {
  const numericPart = Number(code.slice(3));
  return (numericPart >= 25001 && numericPart <= 25142) || 
         code === 'SIH12507' || code === 'SIH12508';
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/problems', async (req, res) => {
  const codes = [];
  for (let n = 25001; n <= 25142; n++) {
    codes.push(`SIH${n}`);
  }
  codes.push('SIH12507', 'SIH12508');
  const items = codes.map(code => ({ code, title: `Problem ${code}` }));
  res.json(items);
});

app.post('/api/submit', async (req, res) => {
  try {
    const parsed = submissionSchema.parse(req.body);
    
    if (!isAllowedProblemCode(parsed.problem_code)) {
      return res.status(400).json({ error: 'Invalid Problem Statement ID' });
    }

    // Insert team
    await db.run(
      `INSERT OR REPLACE INTO teams (team_id, team_name, leader_name, leader_id, phone)
       VALUES (?, ?, ?, ?, ?)`,
      [parsed.team_id, parsed.team_name, parsed.leader_name, parsed.leader_id, parsed.phone]
    );

    // Check submission limit
    const row = await db.get(`SELECT COUNT(*) as count FROM submissions WHERE team_id = ?`, [parsed.team_id]);
    if (row.count >= 2) {
      return res.status(400).json({ error: 'Maximum 2 submissions allowed per team' });
    }

    // Insert submission
    const numericId = Number(parsed.problem_code.slice(3));
    await db.run(
      `INSERT INTO submissions (team_id, problem_id, problem_code, slides_link)
       VALUES (?, ?, ?, ?)`,
      [parsed.team_id, numericId, parsed.problem_code, parsed.slides_link]
    );

    res.json({ success: true, message: `Submitted for Problem ${parsed.problem_code}` });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors.map(e => e.message).join(', ') });
    }
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/submissions', async (req, res) => {
  try {
    const { search = '', sort = 'problem_id', order = 'asc' } = req.query;
    const validSort = ['problem_id', 'created_at'];
    const sortBy = validSort.includes(sort) ? sort : 'problem_id';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    
    const rows = await db.all(
      `SELECT s.*, t.team_name, t.leader_name, t.phone 
       FROM submissions s
       JOIN teams t ON t.team_id = s.team_id
       WHERE s.team_id LIKE ?
       ORDER BY ${sortBy} ${sortOrder}`,
      [`%${search}%`]
    );
    
    res.json(rows);
  } catch (err) {
    console.error('List submissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/submissions/:team_id', async (req, res) => {
  try {
    const { team_id } = req.params;
    const submissions = await db.all(
      `SELECT * FROM submissions WHERE team_id = ? ORDER BY created_at DESC`, 
      [team_id]
    );
    res.json(submissions);
  } catch (err) {
    console.error('Get team submissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
async function startServer() {
  await initDb();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  });
}

startServer().catch(console.error);

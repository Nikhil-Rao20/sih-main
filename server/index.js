import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { z } from 'zod';
import crypto from 'crypto';

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());
app.get('/api/health', (req, res) => res.json({ ok: true }));

let db;

async function initDb() {
  db = await open({
    filename: './server/data.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS teams (
      team_id TEXT PRIMARY KEY,
      team_name TEXT NOT NULL,
      leader_name TEXT NOT NULL,
      leader_id TEXT NOT NULL,
      phone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS juries (
      jury_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      department TEXT NOT NULL,
      password_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS jury_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL,
      jury_id TEXT NOT NULL,
      UNIQUE(team_id, jury_id),
      FOREIGN KEY(team_id) REFERENCES teams(team_id) ON DELETE CASCADE,
      FOREIGN KEY(jury_id) REFERENCES juries(jury_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL,
      problem_id INTEGER NOT NULL,
      problem_code TEXT NOT NULL DEFAULT '',
      slides_link TEXT NOT NULL,
      created_at TEXT NOT NULL,
      presented INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(team_id) REFERENCES teams(team_id)
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
      created_at TEXT NOT NULL,
      UNIQUE(team_id, jury_id)
    );

    CREATE INDEX IF NOT EXISTS idx_juries_email ON juries(email);
    CREATE INDEX IF NOT EXISTS idx_assignments_team ON jury_assignments(team_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_jury ON jury_assignments(jury_id);
    CREATE INDEX IF NOT EXISTS idx_eval_team ON evaluations(team_id);
    CREATE INDEX IF NOT EXISTS idx_eval_team_jury ON evaluations(team_id, jury_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_team ON submissions(team_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
  `);

  // Attempt to backfill presented column if DB existed before
  try {
    const columns = await db.all(`PRAGMA table_info(submissions)`);
    const hasPresented = columns.some(c => c.name === 'presented');
    const hasProblemCode = columns.some(c => c.name === 'problem_code');
    if (!hasPresented) {
      await db.exec(`ALTER TABLE submissions ADD COLUMN presented INTEGER NOT NULL DEFAULT 0`);
    }
    if (!hasProblemCode) {
      await db.exec(`ALTER TABLE submissions ADD COLUMN problem_code TEXT NOT NULL DEFAULT ''`);
    }
  } catch {}

  // Backfill juries.password_hash if missing
  try {
    const columnsJ = await db.all(`PRAGMA table_info(juries)`);
    const hasPwd = columnsJ.some(c => c.name === 'password_hash');
    if (!hasPwd) {
      await db.exec(`ALTER TABLE juries ADD COLUMN password_hash TEXT`);
    }
  } catch {}

  // Seed dummy juries if none exist
  const juryCount = await db.get(`SELECT COUNT(*) as c FROM juries`);
  if (!juryCount || juryCount.c === 0) {
    const seed = [
      // CSE 5
      ['CSE01','Dr. A CSE','cse01@example.com','CSE'],
      ['CSE02','Dr. B CSE','cse02@example.com','CSE'],
      ['CSE03','Dr. C CSE','cse03@example.com','CSE'],
      ['CSE04','Dr. D CSE','cse04@example.com','CSE'],
      ['CSE05','Dr. E CSE','cse05@example.com','CSE'],
      // ECE 3
      ['ECE01','Dr. A ECE','ece01@example.com','ECE'],
      ['ECE02','Dr. B ECE','ece02@example.com','ECE'],
      ['ECE03','Dr. C ECE','ece03@example.com','ECE'],
      // EEE 2
      ['EEE01','Dr. A EEE','eee01@example.com','EEE'],
      ['EEE02','Dr. B EEE','eee02@example.com','EEE'],
      // ME 2
      ['ME01','Dr. A ME','me01@example.com','Mechanical'],
      ['ME02','Dr. B ME','me02@example.com','Mechanical'],
      // Chem 2
      ['CHE01','Dr. A Chem','che01@example.com','Chemical'],
      ['CHE02','Dr. B Chem','che02@example.com','Chemical'],
      // Civil 2
      ['CIV01','Dr. A Civil','civ01@example.com','Civil'],
      ['CIV02','Dr. B Civil','civ02@example.com','Civil'],
      // MME 2
      ['MME01','Dr. A MME','mme01@example.com','Metallurgical & Materials'],
      ['MME02','Dr. B MME','mme02@example.com','Metallurgical & Materials'],
      // Demo juries matching frontend login
      ['jury1','Demo Jury 1', 'jury1@sih2025.com', 'CSE'],
      ['jury2','Demo Jury 2', 'jury2@sih2025.com', 'ECE'],
      ['jury3','Demo Jury 3', 'jury3@sih2025.com', 'EEE'],
      ['jury4','Demo Jury 4', 'jury4@sih2025.com', 'Mechanical']
    ];
    const insertStmt = await db.prepare(`INSERT INTO juries (jury_id, name, email, department) VALUES (?, ?, ?, ?)`);
    try {
      await db.exec('BEGIN');
      for (const row of seed) {
        await insertStmt.run(row);
      }
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
    } finally {
      await insertStmt.finalize();
    }
  }
  // Ensure demo juries have default passwords for login
  try {
    const demoPwds = [
      { email: 'jury1@sih2025.com', pass: 'jury1pass' },
      { email: 'jury2@sih2025.com', pass: 'jury2pass' },
      { email: 'jury3@sih2025.com', pass: 'jury3pass' },
      { email: 'jury4@sih2025.com', pass: 'jury4pass' }
    ];
    for (const { email, pass } of demoPwds) {
      const row = await db.get(`SELECT jury_id, password_hash FROM juries WHERE email = ?`, [email]);
      if (row && (!row.password_hash || String(row.password_hash).trim() === '')) {
        const hashed = hashPassword(pass);
        await db.run(`UPDATE juries SET password_hash = ? WHERE email = ?`, [hashed, email]);
      }
    }
  } catch {}
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

const submissionSchema = z.object({
  team_id: z.string().regex(/^\d{3}_SIH$/i, 'Team ID must match 001_SIH'),
  team_name: z.string().min(2),
  leader_name: z.string().min(2),
  leader_id: z.string().min(2),
  phone: z.string().regex(/^[0-9]{10}$/),
  problem_code: z.string().refine(isAllowedProblemCode, 'Invalid Problem Statement ID'),
  slides_link: z.string().url()
});

app.get('/api/problems', async (req, res) => {
  const codes = [];
  for (let n = 25001; n <= 25142; n++) codes.push(`SIH${n}`);
  codes.push('SIH12507', 'SIH12508');
  const items = codes.map(code => ({ code, title: `Problem ${code}` }));
  res.json(items);
});

app.post('/api/submit', async (req, res) => {
  try {
    const parsed = submissionSchema.parse(req.body);

    // Upsert team
    await db.run(
      `INSERT INTO teams (team_id, team_name, leader_name, leader_id, phone)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(team_id) DO UPDATE SET team_name=excluded.team_name, leader_name=excluded.leader_name, leader_id=excluded.leader_id, phone=excluded.phone`,
      [parsed.team_id, parsed.team_name, parsed.leader_name, parsed.leader_id, parsed.phone]
    );

    // Enforce max 2 submissions per team
    const row = await db.get(`SELECT COUNT(*) as count FROM submissions WHERE team_id = ?`, [parsed.team_id]);
    if (row.count >= 2) {
      return res.status(400).json({ error: 'Submission limit reached. Only 2 ideas allowed per team.' });
    }

    const numericId = Number(parsed.problem_code.slice(3));
    await db.run(
      `INSERT INTO submissions (team_id, problem_id, problem_code, slides_link, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [parsed.team_id, isFinite(numericId) ? numericId : 0, parsed.problem_code, parsed.slides_link]
    );

    // Auto-assign 2-3 juries randomly if none assigned yet
    const existingAssign = await db.get(`SELECT 1 as x FROM jury_assignments WHERE team_id = ? LIMIT 1`, [parsed.team_id]);
    if (!existingAssign) {
      const juryList = await db.all(`SELECT jury_id FROM juries ORDER BY RANDOM() LIMIT 3`);
      const pickCount = Math.max(2, Math.min(3, juryList.length));
      const picked = juryList.slice(0, pickCount).map(j => j.jury_id);
      const stmt = await db.prepare(`INSERT INTO jury_assignments (team_id, jury_id) VALUES (?, ?) ON CONFLICT(team_id, jury_id) DO NOTHING`);
      try {
        await db.exec('BEGIN');
        for (const jid of picked) {
          await stmt.run([parsed.team_id, jid]);
        }
        await db.exec('COMMIT');
      } catch (e) {
        await db.exec('ROLLBACK');
      } finally {
        await stmt.finalize();
      }
    }

    res.json({
      success: true,
      message: `Submitted PPT for Problem Statement ${parsed.problem_id}.`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors.map(e => e.message).join(', ') });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/submissions/:team_id', async (req, res) => {
  const { team_id } = req.params;
  const submissions = await db.all(`SELECT * FROM submissions WHERE team_id = ? ORDER BY created_at DESC`, [team_id]);
  res.json(submissions);
});

// List/search/sort submissions for admin
app.get('/api/submissions', async (req, res) => {
  const { search = '', sort = 'problem_id', order = 'asc' } = req.query;
  const validSort = ['problem_id', 'created_at'];
  const sortBy = validSort.includes(String(sort)) ? String(sort) : 'problem_id';
  const sortOrder = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const like = `%${String(search)}%`;
  const rows = await db.all(
    `SELECT s.id, s.team_id, t.team_name, t.leader_name, t.leader_id, t.phone, s.problem_id, s.problem_code, s.slides_link, s.presented, s.created_at
     FROM submissions s
     JOIN teams t ON t.team_id = s.team_id
     WHERE s.team_id LIKE ?
     ORDER BY ${sortBy} ${sortOrder}, s.created_at DESC`,
    [like]
  );
  res.json(rows);
});

// Mark a submission as presented
app.patch('/api/submissions/:id/presented', async (req, res) => {
  const { id } = req.params;
  await db.run(`UPDATE submissions SET presented = 1 WHERE id = ?`, [id]);
  res.json({ success: true });
});

// Delete a submission
app.delete('/api/submissions/:id', async (req, res) => {
  const { id } = req.params;
  await db.run(`DELETE FROM submissions WHERE id = ?`, [id]);
  res.json({ success: true });
});

// Save jury evaluation
const evaluationSchema = z.object({
  team_id: z.string().min(1),
  jury_id: z.string().min(1),
  ppt_design: z.number().int().min(1).max(10),
  idea: z.number().int().min(1).max(10),
  pitching: z.number().int().min(1).max(10),
  project_impact: z.number().int().min(1).max(10),
  remarks: z.string().optional()
});

app.post('/api/evaluations', async (req, res) => {
  try {
    const e = evaluationSchema.parse(req.body);
    // Ensure jury exists and is assigned to this team
    const juryExists = await db.get(`SELECT 1 FROM juries WHERE jury_id = ?`, [e.jury_id]);
    if (!juryExists) return res.status(403).json({ error: 'Unknown jury' });
    const assigned = await db.get(`SELECT 1 FROM jury_assignments WHERE team_id = ? AND jury_id = ?`, [e.team_id, e.jury_id]);
    if (!assigned) return res.status(403).json({ error: 'Jury not assigned to this team' });
    const total = (e.ppt_design + e.idea + e.pitching + e.project_impact) / 4;
    await db.run(
      `INSERT INTO evaluations (team_id, jury_id, ppt_design, idea, pitching, project_impact, remarks, total_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(team_id, jury_id) DO UPDATE SET
         ppt_design=excluded.ppt_design,
         idea=excluded.idea,
         pitching=excluded.pitching,
         project_impact=excluded.project_impact,
         remarks=excluded.remarks,
         total_score=excluded.total_score,
         created_at=datetime('now')
      `,
      [e.team_id, e.jury_id, e.ppt_design, e.idea, e.pitching, e.project_impact, e.remarks || null, total]
    );

    // After save, if all assigned juries submitted, mark team's submissions presented
    const expectedRow = await db.get(`SELECT COUNT(*) as c FROM jury_assignments WHERE team_id = ?`, [e.team_id]);
    const doneRow = await db.get(`SELECT COUNT(*) as c FROM evaluations WHERE team_id = ? AND jury_id IN (SELECT jury_id FROM jury_assignments WHERE team_id = ?)`, [e.team_id, e.team_id]);
    if (expectedRow && doneRow && expectedRow.c > 0 && doneRow.c >= expectedRow.c) {
      await db.run(`UPDATE submissions SET presented = 1 WHERE team_id = ?`, [e.team_id]);
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors.map(e => e.message).join(', ') });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin scores secure access (re-auth on request)
const ADMIN_CREDENTIALS = { username: 'admin', password: 'sih2025admin' };
app.post('/api/admin/scores', async (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const rows = await db.all(
    `SELECT s.team_id, t.team_name, s.problem_id,
            AVG(e.total_score) as avg_score,
            COUNT(e.id) as evaluations_count
     FROM submissions s
     JOIN teams t ON t.team_id = s.team_id
     LEFT JOIN evaluations e ON e.team_id = s.team_id
     GROUP BY s.team_id, s.problem_id
     ORDER BY avg_score DESC NULLS LAST`
  );
  // Include per-jury scores
  const perJury = await db.all(`SELECT team_id, jury_id, total_score FROM evaluations`);
  res.json({ summary: rows, perJury });
});

// Admin: list juries
app.get('/api/admin/juries', async (req, res) => {
  try {
    const juries = await db.all(`SELECT jury_id, name, email, department FROM juries ORDER BY department, name`);
    res.json(juries);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load juries' });
  }
});

// Admin: create or update a jury
const juryUpsertSchema = z.object({
  jury_id: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')).transform(v => v || null),
  department: z.string().min(2),
  password: z.string().min(4).optional().or(z.literal('')).transform(v => v || undefined)
});
app.post('/api/admin/juries', async (req, res) => {
  try {
    const j = juryUpsertSchema.parse(req.body);
    if (j.password) {
      const pwd = hashPassword(j.password);
      await db.run(
        `INSERT INTO juries (jury_id, name, email, department, password_hash) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(jury_id) DO UPDATE SET name=excluded.name, email=excluded.email, department=excluded.department, password_hash=excluded.password_hash`,
        [j.jury_id, j.name, j.email, j.department, pwd]
      );
    } else {
      await db.run(
        `INSERT INTO juries (jury_id, name, email, department) VALUES (?, ?, ?, ?)
         ON CONFLICT(jury_id) DO UPDATE SET name=excluded.name, email=excluded.email, department=excluded.department`,
        [j.jury_id, j.name, j.email, j.department]
      );
    }
    res.json({ success: true });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(x => x.message).join(', ') });
    console.error(e);
    res.status(500).json({ error: 'Failed to save jury' });
  }
});

// Admin: delete a jury
app.delete('/api/admin/juries/:jury_id', async (req, res) => {
  try {
    const { jury_id } = req.params;
    await db.run(`DELETE FROM juries WHERE jury_id = ?`, [jury_id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete jury' });
  }
});

// Jury login
app.post('/api/jury/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const jury = await db.get(`SELECT jury_id, name, email, department, password_hash FROM juries WHERE email = ?`, [email]);
    if (!jury || !verifyPassword(password, jury.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ jury_id: jury.jury_id, name: jury.name, department: jury.department });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin: get and set assignments for a jury
app.get('/api/admin/assignments/:jury_id', async (req, res) => {
  const { jury_id } = req.params;
  const list = await db.all(`SELECT team_id FROM jury_assignments WHERE jury_id = ? ORDER BY team_id`, [jury_id]);
  res.json(list.map(r => r.team_id));
});
app.post('/api/admin/assignments/:jury_id', async (req, res) => {
  try {
    const { jury_id } = req.params;
    const { team_ids } = req.body || {};
    if (!Array.isArray(team_ids)) return res.status(400).json({ error: 'team_ids array required' });
    // Filter only existing team_ids to avoid FK violations
    const placeholders = team_ids.map(() => '?').join(',');
    const rows = await db.all(`SELECT team_id FROM teams WHERE team_id IN (${placeholders})`, team_ids.map(t => String(t)));
    const validIds = rows.map(r => r.team_id);
    await db.exec('BEGIN');
    await db.run(`DELETE FROM jury_assignments WHERE jury_id = ?`, [jury_id]);
    const stmt = await db.prepare(`INSERT INTO jury_assignments (team_id, jury_id) VALUES (?, ?)`);
    try {
      for (const tid of validIds) {
        await stmt.run([String(tid), jury_id]);
      }
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    } finally {
      await stmt.finalize();
    }
    const skipped = team_ids.filter(t => !validIds.includes(String(t)));
    res.json({ success: true, count: validIds.length, skipped });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save assignments' });
  }
});

// List assigned teams for a jury with evaluation status
app.get('/api/jury/:jury_id/assigned-teams', async (req, res) => {
  const { jury_id } = req.params;
  const exists = await db.get(`SELECT 1 FROM juries WHERE jury_id = ?`, [jury_id]);
  if (!exists) return res.status(404).json({ error: 'Jury not found' });
  const rows = await db.all(
    `SELECT DISTINCT s.team_id, t.team_name, t.leader_name, t.leader_id, s.slides_link,
            COALESCE((SELECT 1 FROM evaluations e WHERE e.team_id = s.team_id AND e.jury_id = ?), 0) as evaluated,
            s.problem_id,
            COALESCE((SELECT AVG(e2.total_score) FROM evaluations e2 WHERE e2.team_id = s.team_id), NULL) as avg_score
     FROM submissions s
     JOIN teams t ON t.team_id = s.team_id
     JOIN jury_assignments ja ON ja.team_id = s.team_id
     WHERE ja.jury_id = ?
     ORDER BY s.created_at DESC`,
    [jury_id, jury_id]
  );
  res.json(rows);
});

// Bulk assign teams to juries via JSON or CSV text
app.post('/api/admin/jury-mapping', async (req, res) => {
  const { mapping, csv } = req.body || {};
  let pairs = [];
  try {
    if (Array.isArray(mapping)) {
      pairs = mapping.filter(x => x && x.team_id && x.jury_id).map(x => [String(x.team_id), String(x.jury_id)]);
    } else if (typeof csv === 'string') {
      // Expect header team_id,jury_id
      const lines = csv.split(/\r?\n/).filter(l => l.trim());
      for (let i = 0; i < lines.length; i++) {
        const [team_id, jury_id] = lines[i].split(',').map(s => s.trim());
        if (!team_id || !jury_id || team_id === 'team_id') continue;
        pairs.push([team_id, jury_id]);
      }
    } else {
      return res.status(400).json({ error: 'Provide mapping array or csv text' });
    }
    if (!pairs.length) return res.status(400).json({ error: 'No pairs to import' });
    await db.exec('BEGIN');
    const stmt = await db.prepare(`INSERT INTO jury_assignments (team_id, jury_id) VALUES (?, ?) ON CONFLICT(team_id, jury_id) DO NOTHING`);
    try {
      for (const [team, jury] of pairs) {
        await stmt.run([team, jury]);
      }
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    } finally {
      await stmt.finalize();
    }
    res.json({ success: true, imported: pairs.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to import mapping' });
  }
});

async function startServer(startPort) {
  const server = app.listen(startPort, () => {
    console.log(`API running on http://localhost:${startPort}`);
  });
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      const nextPort = startPort + 1;
      if (nextPort <= startPort + 10) {
        console.warn(`Port ${startPort} in use, retrying on ${nextPort}...`);
        setTimeout(() => startServer(nextPort), 300);
      } else {
        console.error('No available port found in range. Set PORT env var to a free port.');
        process.exit(1);
      }
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

initDb().then(() => {
  startServer(DEFAULT_PORT);
});

// Fallback error handler to ensure JSON responses
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Unexpected server error' });
});



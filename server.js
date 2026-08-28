const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Cookie Parser Helper ---
function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const parts = cookies[i].split('=');
    const key = parts[0].trim();
    if (key === name) {
      return parts[1] ? decodeURIComponent(parts[1]) : '';
    }
  }
  return null;
}

// --- Users Configuration Loader ---
const USERS_FILE_PATH = path.join(__dirname, 'users.json');
let usersConfig = { "gwd_officer": "gwd_password_2026" }; // default fallback

function loadUsersConfig() {
  try {
    if (fs.existsSync(USERS_FILE_PATH)) {
      usersConfig = JSON.parse(fs.readFileSync(USERS_FILE_PATH, 'utf8'));
      console.log("Loaded users configuration successfully.");
    }
  } catch (err) {
    console.error("Failed to read users.json:", err);
  }
}
loadUsersConfig();

// In-memory active session tracking
const activeSessions = new Set();

// --- Auth Middleware ---
function authMiddleware(req, res, next) {
  const token = getCookie(req, 'gwd_session_token');
  if (token && activeSessions.has(token)) {
    return next();
  }
  
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }
  res.redirect('/login.html');
}

// --- Route Protection Configuration ---
// Serve login page and static baseline resources publicly
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'styles.css'));
});
app.get('/icon-512.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'icon-512.png'));
});
app.get('/xlsx.full.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'xlsx.full.min.js'));
});
app.get('/wells_initial.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wells_initial.js'));
});
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

// Auth check API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Missing username or password" });
  }

  loadUsersConfig(); // reload to get latest config additions

  const correctPassword = usersConfig[username];
  if (correctPassword && correctPassword === password) {
    const token = 'gwd_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    activeSessions.add(token);

    // Set Cookie: Max age 7 days, HttpOnly to protect against XSS
    res.setHeader('Set-Cookie', `gwd_session_token=${token}; Max-Age=${7 * 24 * 60 * 60}; Path=/; HttpOnly`);
    return res.json({ success: true, username: username });
  }

  res.status(401).json({ message: "Invalid username or password" });
});

app.post('/api/logout', (req, res) => {
  const token = getCookie(req, 'gwd_session_token');
  if (token) {
    activeSessions.delete(token);
  }
  res.setHeader('Set-Cookie', 'gwd_session_token=; Max-Age=0; Path=/; HttpOnly');
  res.json({ success: true });
});

// Protect the main page and redirects
app.get('/', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/index.html', authMiddleware, (req, res) => {
  res.redirect('/');
});

// Protect data folder and uploaded photos
app.use('/data', authMiddleware, express.static(path.join(__dirname, 'public', 'data')));
app.use('/uploads', authMiddleware, express.static(path.join(__dirname, 'uploads')));

// Protect API endpoints
app.use('/api', (req, res, next) => {
  if (req.path === '/login' || req.path === '/logout') {
    return next();
  }
  authMiddleware(req, res, next);
});

// Serve main public files for authenticated users
app.use(express.static(path.join(__dirname, 'public')));


// --- PostgreSQL Database Config ---
const { Pool } = require('pg');
const pgPool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '1234',
  database: 'bhujal_monitor',
  port: 5432,
  max: 40,
  idleTimeoutMillis: 30000
});

const UPLOADS_DIR = path.join(__dirname, 'uploads');
let isLoaded = false;
let loadError = null;

// Test database connection on startup
async function initDB() {
  try {
    await pgPool.query('SELECT 1');
    isLoaded = true;
    loadError = null;
    console.log("PostgreSQL database connected successfully.");
  } catch (err) {
    loadError = err.message;
    console.error("Failed to connect to PostgreSQL:", err);
  }
}
initDB();

// API: Get status/loaded info
app.get('/api/status', async (req, res) => {
  try {
    const countRes = await pgPool.query('SELECT count(*) FROM wells');
    res.json({
      loaded: isLoaded,
      error: loadError,
      totalWells: parseInt(countRes.rows[0].count, 10)
    });
  } catch (err) {
    res.json({
      loaded: false,
      error: err.message,
      totalWells: 0
    });
  }
});

// API: Get all historical visits (for charts and trend plotting)
app.get('/api/visits/history', async (req, res) => {
  try {
    const dbResult = await pgPool.query(`
      SELECT well_number, season_key, date, dtgwl_mbgl, remarks
      FROM visits
    `);
    
    const historyMap = {};
    dbResult.rows.forEach(row => {
      const wNum = row.well_number;
      if (!historyMap[wNum]) {
        historyMap[wNum] = {};
      }
      historyMap[wNum][row.season_key] = {
        date: row.date,
        value: row.dtgwl_mbgl,
        remarks: row.remarks || ''
      };
    });
    
    res.json(historyMap);
  } catch (err) {
    console.error("Failed to query visits history from PostgreSQL:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Get all wells (supports optional season/year filters)
app.get('/api/wells', async (req, res) => {
  const year = req.query.year || '2026';
  const season = req.query.season || 'PreMon';
  
  let seasonCode = season;
  if (season.toLowerCase().includes('pre')) seasonCode = 'PreMon';
  else if (season.toLowerCase().includes('mid') || season.toLowerCase().includes('mon')) seasonCode = 'MidMon';
  else if (season.toLowerCase().includes('post')) seasonCode = 'PostMon';
  else if (season.toLowerCase().includes('winter')) seasonCode = 'Winter';
  
  const seasonKey = `${year}_${seasonCode}`;
  
  try {
    const dbResult = await pgPool.query(`
      SELECT 
        w.well_number, w.sheet, w.district, w.block, w.location, w.well_type,
        w.lat_raw, w.lon_raw, w.lat, w.lon, w.depth, w.parapet_height, w.msl, w.rl,
        v.date, v.dtgwl_bmp, v.dtgwl_mbgl, v.remarks
      FROM wells w
      LEFT JOIN visits v ON w.well_number = v.well_number AND v.season_key = $1;
    `, [seasonKey]);
    
    const enrichedWells = dbResult.rows.map((row, idx) => {
      const photoPath = path.join(UPLOADS_DIR, `${row.well_number}.jpg`);
      const hasPhoto = fs.existsSync(photoPath);
      return {
        sheet: row.sheet || '',
        row_idx: idx + 1,
        sl_no: (idx + 1).toString(),
        block: row.block || '',
        location: row.location || '',
        well_type: row.well_type || 'DW',
        well_number: row.well_number,
        lat_raw: row.lat_raw || '',
        lon_raw: row.lon_raw || '',
        lat: row.lat,
        lon: row.lon,
        date: row.date || null,
        depth: row.depth || '',
        parapet_height: row.parapet_height || 0.0,
        dtgwl_bmp: row.dtgwl_bmp,
        dtgwl_mbgl: row.dtgwl_mbgl,
        remarks: row.remarks || '',
        msl: row.msl,
        rl: row.rl,
        photoUrl: hasPhoto ? `/uploads/${row.well_number}.jpg` : null
      };
    });
    
    res.json(enrichedWells);
  } catch (err) {
    console.error("Failed to query wells from PostgreSQL:", err);
    res.status(500).json({ error: "Failed to read database: " + err.message });
  }
});

// API: Force reload/re-migrate data from Excel baseline
app.post('/api/wells/reload', async (req, res) => {
  isLoaded = false;
  try {
    const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
    execFile(pythonCmd, ['migrate_to_postgres.py'], { cwd: __dirname }, async (error, stdout, stderr) => {
      if (error) {
        loadError = error.message;
        return res.status(500).json({ error: "Reload failed: " + error.message });
      }
      await initDB();
      res.json({ success: true, message: "Database reloaded from Excel baseline." });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Infer season code based on Date of visit
function inferSeasonKeyFromDate(dateStr) {
  if (!dateStr) return "2026_PreMon";
  const parts = dateStr.split('.');
  if (parts.length !== 3) return "2026_PreMon";
  
  const month = parseInt(parts[1], 10);
  const year = parts[2];
  
  let season = "PreMon";
  if (month === 12 || month === 1 || month === 2) {
    season = "Winter";
  } else if (month >= 3 && month <= 5) {
    season = "PreMon";
  } else if (month >= 6 && month <= 9) {
    season = "MidMon";
  } else if (month >= 10 && month <= 11) {
    season = "PostMon";
  }
  
  return `${year}_${season}`;
}

// API: Update groundwater level measurements
app.post('/api/wells/update', async (req, res) => {
  const { date, bmp, mbgl, parapet, well_number, lat, lon } = req.body;
  
  if (!well_number) {
    return res.status(400).json({ error: "Missing well_number parameter" });
  }
  
  try {
    // 1. Update well coordinates and parapet height in wells table if provided
    if (lat !== undefined && lat !== null && lat !== '' && lon !== undefined && lon !== null && lon !== '') {
      const pHeight = parapet !== undefined && parapet !== null && parapet !== '' ? parseFloat(parapet) : 0.0;
      await pgPool.query(
        `UPDATE wells 
         SET lat = $1, lon = $2, lat_raw = $3, lon_raw = $4, parapet_height = $5
         WHERE well_number = $6`,
        [parseFloat(lat), parseFloat(lon), lat.toString(), lon.toString(), pHeight, well_number.toUpperCase()]
      );
    } else if (parapet !== undefined && parapet !== null && parapet !== '') {
      await pgPool.query(
        `UPDATE wells SET parapet_height = $1 WHERE well_number = $2`,
        [parseFloat(parapet), well_number.toUpperCase()]
      );
    }
    
    // 2. Insert or update the visit measurement
    const seasonKey = inferSeasonKeyFromDate(date);
    await pgPool.query(
      `INSERT INTO visits (well_number, season_key, date, dtgwl_bmp, dtgwl_mbgl, remarks)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (well_number, season_key) DO UPDATE
       SET date = EXCLUDED.date,
           dtgwl_bmp = EXCLUDED.dtgwl_bmp,
           dtgwl_mbgl = EXCLUDED.dtgwl_mbgl,
           remarks = EXCLUDED.remarks;`,
      [
        well_number.toUpperCase(),
        seasonKey,
        date || '',
        bmp !== undefined && bmp !== null && bmp !== '' ? parseFloat(bmp) : null,
        mbgl !== undefined && mbgl !== null && mbgl !== '' ? parseFloat(mbgl) : null,
        ''
      ]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating well measurement in PostgreSQL:", err);
    res.status(500).json({ error: err.message });
  }
});

// Configure Multer for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const wellNumber = req.body.well_number;
    if (!wellNumber) {
      return cb(new Error("Missing well_number for upload"));
    }
    cb(null, `${wellNumber}.jpg`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// API: Upload site photo
app.post('/api/wells/upload-photo', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No photo uploaded" });
  }
  const wellNumber = req.body.well_number;
  res.json({ 
    success: true, 
    url: `/uploads/${wellNumber}.jpg?t=${Date.now()}`
  });
});

// API: Download current Excel sheet
app.get('/api/export', (req, res) => {
  if (fs.existsSync(EXCEL_FILE_PATH)) {
    res.download(EXCEL_FILE_PATH, 'CTC_WINTER_Field_Book_2026_Updated.xlsx');
  } else {
    res.status(404).json({ error: "Spreadsheet file not found" });
  }
});

// API: Download district-specific Excel sheet
app.get('/api/export/district', async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ error: "Missing district name parameter" });
  }
  
  try {
    const timestamp = Date.now();
    const tempFileName = `District_Report_${name}_${timestamp}.xlsx`;
    const tempFilePath = path.join(BACKUPS_DIR, tempFileName);
    
    const output = await runPythonHandler(['export_district', '--district', name, '--output', tempFilePath]);
    const result = JSON.parse(output);
    
    if (result.success && fs.existsSync(tempFilePath)) {
      res.download(tempFilePath, `${name}_District_Field_Book_2026.xlsx`, (err) => {
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (e) {
          console.error("Failed to delete temp export file:", e);
        }
      });
    } else {
      res.status(500).json({ error: result.error || "Failed to generate district report" });
    }
  } catch (err) {
    console.error("Error exporting district:", err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy endpoint to query NWIC datastore API securely (bypasses CORS blocks)
const https = require('https');
app.post('/api/nwic/telemetry', (req, res) => {
  const { resource_id, filters, limit, offset } = req.body;
  const postData = JSON.stringify({
    resource_id: resource_id || '7de68858-4e78-4a09-8a3a-c63c4a027eeb',
    filters: filters || {},
    limit: limit || 1000,
    offset: offset || 0
  });

  const options = {
    hostname: 'nwdp.nwic.gov.in',
    port: 443,
    path: '/api/3/action/datastore_search',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };

  const nwReq = https.request(options, (nwRes) => {
    let body = '';
    nwRes.on('data', (chunk) => body += chunk);
    nwRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.status(nwRes.statusCode || 200).send(body);
    });
  });

  nwReq.on('error', (err) => {
    console.error("NWIC Proxy Error:", err);
    res.status(500).json({ error: "Failed to connect to NWIC server: " + err.message });
  });

  nwReq.write(postData);
  nwReq.end();
});

// Proxy endpoint to query Google News RSS securely
app.get('/api/news', (req, res) => {
  const targetUrl = 'https://news.google.com/rss/search?q=groundwater+india+OR+groundwater+global&hl=en-IN&gl=IN&ceid=IN:en';
  https.get(targetUrl, (nwRes) => {
    let body = '';
    nwRes.on('data', (chunk) => body += chunk);
    nwRes.on('end', () => {
      res.setHeader('Content-Type', 'application/xml');
      res.status(nwRes.statusCode || 200).send(body);
    });
  }).on('error', (err) => {
    console.error("News Proxy Error:", err);
    res.status(500).json({ error: "Failed to connect to Google News: " + err.message });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Groundwater server listening at http://localhost:${PORT}`);
});

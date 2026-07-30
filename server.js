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


// --- Spreadsheet File Config & Python runner ---
const EXCEL_FILE_PATH = path.join(__dirname, 'CTC Pre-monsoon Field Book 2026.xlsx');
const BACKUPS_DIR = path.join(__dirname, 'backups');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Cache to store wells data in memory
let wellsCache = [];
let isLoaded = false;
let loadError = null;

// Helper function to run the python excel handler
function runPythonHandler(args) {
  return new Promise((resolve, reject) => {
    execFile('py', ['excel_handler.py', ...args], { cwd: __dirname, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      resolve(stdout);
    });
  });
}

// Function to load Excel data into memory
async function loadExcelData() {
  console.log("Loading Excel data...");
  try {
    const output = await runPythonHandler(['read']);
    wellsCache = JSON.parse(output);
    isLoaded = true;
    loadError = null;
    console.log(`Excel data loaded successfully. Total wells: ${wellsCache.length}`);
  } catch (err) {
    loadError = err.message;
    console.error("Failed to load Excel data:", err);
  }
}

// Load data on startup
loadExcelData();

// API: Get status/loaded info
app.get('/api/status', (req, res) => {
  res.json({
    loaded: isLoaded,
    error: loadError,
    totalWells: wellsCache.length
  });
});

// API: Get all wells
app.get('/api/wells', async (req, res) => {
  if (!isLoaded) {
    if (loadError) {
      return res.status(500).json({ error: "Failed to read excel: " + loadError });
    }
    return res.status(503).json({ error: "Data is loading, please try again in a few seconds." });
  }
  
  const enrichedWells = wellsCache.map(well => {
    const photoPath = path.join(UPLOADS_DIR, `${well.well_number}.jpg`);
    const hasPhoto = fs.existsSync(photoPath);
    return {
      ...well,
      photoUrl: hasPhoto ? `/uploads/${well.well_number}.jpg` : null
    };
  });
  
  res.json(enrichedWells);
});

// API: Force reload data from Excel
app.post('/api/wells/reload', async (req, res) => {
  isLoaded = false;
  await loadExcelData();
  if (loadError) {
    return res.status(500).json({ error: "Reload failed: " + loadError });
  }
  res.json({ success: true, totalWells: wellsCache.length });
});

// API: Update groundwater level measurements
app.post('/api/wells/update', async (req, res) => {
  const { sheet, row_idx, date, bmp, mbgl, parapet, well_number } = req.body;
  
  if (!sheet || !row_idx) {
    return res.status(400).json({ error: "Missing sheet or row_idx parameters" });
  }
  
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    const backupFileName = `CTC_WINTER_Field_Book_2026_backup_${timestamp}.xlsx`;
    const backupFilePath = path.join(BACKUPS_DIR, backupFileName);
    
    if (fs.existsSync(EXCEL_FILE_PATH)) {
      fs.copyFileSync(EXCEL_FILE_PATH, backupFilePath);
    }
    
    const writeArgs = [
      'write',
      '--sheet', sheet,
      '--row', row_idx.toString(),
      '--date', date || '',
      '--bmp', bmp !== undefined && bmp !== null ? bmp.toString() : 'null',
      '--mbgl', mbgl !== undefined && mbgl !== null ? mbgl.toString() : 'null',
      '--parapet', parapet !== undefined && parapet !== null ? parapet.toString() : 'null'
    ];
    
    const writeOutput = await runPythonHandler(writeArgs);
    const result = JSON.parse(writeOutput);
    
    if (result.success) {
      const wellIndex = wellsCache.findIndex(w => w.sheet === sheet && w.row_idx === parseInt(row_idx));
      if (wellIndex !== -1) {
        wellsCache[wellIndex].date = date || null;
        wellsCache[wellIndex].dtgwl_bmp = bmp !== undefined && bmp !== null && bmp !== '' ? parseFloat(bmp) : null;
        wellsCache[wellIndex].dtgwl_mbgl = mbgl !== undefined && mbgl !== null && mbgl !== '' ? parseFloat(mbgl) : null;
        if (parapet !== undefined && parapet !== null && parapet !== '') {
          wellsCache[wellIndex].parapet_height = parseFloat(parapet);
        }
      }
      res.json({ success: true });
    } else {
      res.status(500).json({ error: result.error || "Failed to update spreadsheet" });
    }
  } catch (err) {
    console.error("Error updating well:", err);
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

// Start the server
app.listen(PORT, () => {
  console.log(`Groundwater server listening at http://localhost:${PORT}`);
});

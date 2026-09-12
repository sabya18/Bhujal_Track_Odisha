# Bhujal Track - Server Hosting & Database Customization Package (v69 Baseline)

This directory (`Bhujal_Track_v69_Final_Server`) contains all required files for hosting **Bhujal Track** on a web server, managing the database manually, and accessing the official release APK.

---

## 📁 Directory Structure

```
Bhujal_Track_v69_Final_Server/
├── release_apk/
│   └── Bhujal_Track_Release_v69_ScrollableYearSelector.apk  # Official Android Release APK
├── database/
│   ├── wells.json                                            # Primary groundwater monitoring database
│   ├── wtto_preloaded.json                                   # Pre-monsoon dataset (WTTO)
│   └── WTTO_DIST_WISE_PREMON_2026.xlsx                       # Reference Excel database
├── server_backend/
│   ├── server.js                                             # Express Node.js Backend Server
│   ├── package.json                                          # Backend dependencies
│   ├── users.json                                            # Server auth/user storage
│   └── excel_handler.py                                      # Python script for processing Excel files
├── dist_web/                                                 # Exported static web application (for web hosting)
└── app_source/                                               # Complete React Native / Expo App Source Code
```

---

## 🛠️ How to Manually Edit / Change the Database

You can manually modify the data in two places depending on your hosting setup:

### Option A: Mobile App Database (Embedded Data)
1. Open `app_source/src/data/wells.json` or `database/wells.json`.
2. Edit the entries directly in JSON format. Each entry contains:
   - `district`: District Name
   - `block`: Block Name
   - `location`: Station / Location Name
   - `lat` & `lon`: Geolocation coordinates
   - `depth`: Well depth (meters)
   - `dtgwl_mbgl`: Water level below ground level (MBGL)
   - `season`: Monitoring season (e.g. `Pre-monsoon 2026`)
3. Save the file.
4. To rebuild the APK after database changes:
   - Navigate to `app_source/`.
   - Run: `npx expo export` or `cd android && ./gradlew assembleRelease`.

### Option B: Backend Server Database
1. Update `database/wells.json` or upload Excel files via the backend API.
2. Start the Node.js server (see below).

---

## 🚀 How to Run / Host the Backend Server

1. Navigate to the `server_backend/` folder:
   ```bash
   cd server_backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
   The server will start on port **3000** (or the port specified in your environment variables).

---

## 🌐 How to Host the Web Application

1. Deploy the contents of `dist_web/` to any standard web server (Nginx, Apache, Netlify, Vercel, IIS, or Node static server).
2. Point your domain or web root to `dist_web/index.html`.

---

## 📱 Official Android Release APK

The compiled and verified release APK is located at:
```
Bhujal_Track_v69_Final_Server/release_apk/Bhujal_Track_Release_v69_ScrollableYearSelector.apk
```

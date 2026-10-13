const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const TABLE = process.env.DB_TABLE || 'pzem_telemetry';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'power_db',
  connectionLimit: 5
});

// คอลัมน์ที่ใช้งาน
const REQUIRED = ['id', 'device_time', 'recorded_at', 'phase_id', 'voltage', 'current', 'power', 'energy'];

const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);

// API เช็ค Schema
app.get('/api/schema', async (req, res) => {
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM \`${TABLE}\``);
    const have = cols.map(c => c.Field);
    res.json({ table: TABLE, columns: have, missing: REQUIRED.filter(c => !have.includes(c)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- [ปรับใหม่] GET /api/energy-history (Server-side Search & Pagination) ----
app.get('/api/energy-history', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 5000);
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    // 1. กรอง Phase
    const phase = parseInt(req.query.phase, 10);
    if ([1, 2, 3].includes(phase)) {
      where.push('phase_id = ?');
      params.push(phase);
    }

    // 2. กรองช่วงวันที่ (from - to)
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) {
      where.push('recorded_at >= ?');
      params.push(`${req.query.from} 00:00:00`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) {
      where.push('recorded_at <= ?');
      params.push(`${req.query.to} 23:59:59`);
    }

    // 3. กรองคำค้นหา (Search Query) ค้นหาทุกฟิลด์ในฐานข้อมูล
    const search = (req.query.search || '').trim();
    if (search) {
      where.push(`(
        CAST(id AS CHAR) LIKE ? OR
        CAST(device_time AS CHAR) LIKE ? OR
        CAST(recorded_at AS CHAR) LIKE ? OR
        CAST(voltage AS CHAR) LIKE ? OR
        CAST(current AS CHAR) LIKE ? OR
        CAST(power AS CHAR) LIKE ? OR
        CAST(energy AS CHAR) LIKE ?
      )`);
      const sParam = `%${search}%`;
      params.push(sParam, sParam, sParam, sParam, sParam, sParam, sParam);
    }

    const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    // นับจำนวนทั้งหมดที่ตรงเงื่อนไข
    const countSql = `SELECT COUNT(*) AS total FROM \`${TABLE}\`${whereClause}`;
    const [[{ total }]] = await pool.query(countSql, params);

    // ดึงข้อมูลเฉพาะหน้าที่เลือก
    const dataSql = `SELECT ${REQUIRED.map(c => `\`${c}\``).join(', ')} FROM \`${TABLE}\`${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(dataSql, [...params, limit, offset]);

    const formattedRows = rows.map(r => ({
      id: r.id,
      device_time: r.device_time,
      recorded_at: r.recorded_at,
      phase_id: r.phase_id,
      voltage: num(r.voltage),
      current: num(r.current),
      power: num(r.power),
      energy: num(r.energy)
    }));

    // กรณีขอแบบ raw array (สำหรับดึงข้อมูลทำกราฟรายวัน/ส่งออก CSV)
    if (req.query.raw === 'true') {
      return res.json(formattedRows);
    }

    // ตอบกลับโครงสร้างข้อมูลพร้อม Metadata สำหรับทำ Pagination
    res.json({
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      data: formattedRows
    });
  } catch (err) {
    console.error('History Query Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/energy-latest (ดึงค่าล่าสุดของแต่ละเฟสสำหรับ KPI Bar)
app.get('/api/energy-latest', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.* FROM \`${TABLE}\` t
       JOIN (SELECT phase_id, MAX(id) AS max_id FROM \`${TABLE}\` WHERE phase_id IN (1,2,3) GROUP BY phase_id) m
         ON t.id = m.max_id`);
    const phases = { l1: null, l2: null, l3: null };
    let totalPower = 0, totalEnergy = 0, latestTime = null;
    rows.forEach(r => {
      phases['l' + r.phase_id] = {
        voltage: num(r.voltage),
        current: num(r.current),
        power: num(r.power),
        energy: num(r.energy),
        pf: num(r.pf)
      };
      totalPower += num(r.power) ?? 0;
      totalEnergy += num(r.energy) ?? 0;
      if (!latestTime || new Date(r.recorded_at) > new Date(latestTime)) latestTime = r.recorded_at;
    });
    res.json({ phases, totalPower, totalEnergy, frequency: null, timestamp: latestTime, rawRows: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Server กำลังทำงานที่ http://localhost:${PORT}`));
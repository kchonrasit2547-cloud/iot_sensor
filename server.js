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

// คอลัมน์ที่ energy_history.html ใช้ (1 แถว = 1 เฟส)
const REQUIRED = ['id', 'device_time', 'recorded_at', 'phase_id', 'voltage', 'current', 'power', 'energy'];

const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);

// ---- เดิม: ไม่แก้พฤติกรรม ----
app.get('/api/energy-data', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM \`${TABLE}\` ORDER BY id DESC LIMIT 100`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- ตรวจว่าตารางมีคอลัมน์ครบหรือไม่ ----
app.get('/api/schema', async (req, res) => {
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM \`${TABLE}\``);
    const have = cols.map(c => c.Field);
    res.json({ table: TABLE, columns: have, missing: REQUIRED.filter(c => !have.includes(c)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- ใหม่: GET /api/energy-history?limit=1000&phase=1|2|3&from=YYYY-MM-DD&to=YYYY-MM-DD ----
// คืน "array" ตรง ๆ ตามที่ energy_history.html ตรวจด้วย Array.isArray
app.get('/api/energy-history', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 1000, 1), 5000);
    const where = [];
    const params = [];

    const phase = parseInt(req.query.phase, 10);
    if ([1, 2, 3].includes(phase)) { where.push('phase_id = ?'); params.push(phase); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) { where.push('recorded_at >= ?'); params.push(`${req.query.from} 00:00:00`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) { where.push('recorded_at <= ?'); params.push(`${req.query.to} 23:59:59`); }

    const sql = `SELECT ${REQUIRED.map(c => `\`${c}\``).join(', ')} FROM \`${TABLE}\`` +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ' ORDER BY id DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(sql, params);
    // แรงดัน/ค่าอื่นที่เป็น NULL ส่งเป็น null (ไม่แปลงเป็น 0) หน้าเว็บจะแสดง "--"
    res.json(rows.map(r => ({
      id: r.id,
      device_time: r.device_time,
      recorded_at: r.recorded_at,
      phase_id: r.phase_id,
      voltage: num(r.voltage),
      current: num(r.current),
      power: num(r.power),
      energy: num(r.energy)
    })));
  } catch (err) {
    console.error('History Query Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- ใหม่: ค่าล่าสุดของแต่ละเฟส ในรูปแบบที่ energy.html ใช้ (phases/totalPower/totalEnergy) ----
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
        pf: num(r.pf) // ถ้าตารางไม่มีคอลัมน์ pf จะเป็น null
      };
      totalPower += num(r.power) ?? 0;
      totalEnergy += num(r.energy) ?? 0;
      if (!latestTime || new Date(r.recorded_at) > new Date(latestTime)) latestTime = r.recorded_at;
    });
    res.json({ phases, totalPower, totalEnergy, frequency: null, timestamp: latestTime });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Server กำลังทำงานที่ http://localhost:${PORT}`));

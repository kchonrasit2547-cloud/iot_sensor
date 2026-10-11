/**
 * Smart IoT Hub - Common Shared Library
 * Shared across: dashboard.html, analytics.html, energy.html, history.html, settings.html
 */

// =========================================================================
// 1. Shared State & Configurations
// =========================================================================
let ws = null;
let reconnectTimer = null;

// Get or initialize WebSocket URL
function getWsUrl() {
  const host = window.location.hostname || 'localhost';
  return localStorage.getItem('nodered_ws_url') || `ws://${host}:1880/ws/sensors`;
}

// Thresholds
function getThresholds() {
  return {
    tempMax: parseFloat(localStorage.getItem('iot_thresh_temp') || '35.0'),
    humiMax: parseFloat(localStorage.getItem('iot_thresh_humi') || '70.0'),
    lightMin: parseFloat(localStorage.getItem('iot_thresh_light') || '150.0')
  };
}

// Telemetry Logs Store
function getStoredLogs() {
  try {
    return JSON.parse(localStorage.getItem('iot_telemetry_logs') || '[]');
  } catch (e) {
    return [];
  }
}

function saveStoredLogs(logs) {
  try {
    const trimmed = logs.slice(0, 500);
    localStorage.setItem('iot_telemetry_logs', JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save logs to localStorage:', e);
  }
}

let allTelemetryLogs = getStoredLogs();

// PZEM State Cache
function getStoredPzemData() {
  try {
    return JSON.parse(localStorage.getItem('pzem_cached_data') || 'null') || {
      voltage: 0.0,
      current: 0.0,
      power: 0.0,
      energy: 0.0,
      frequency: 0.0,
      powerFactor: 0.0,
      l1: { voltage: 0, current: 0, power: 0, pf: 0 },
      l2: { voltage: 0, current: 0, power: 0, pf: 0 },
      l3: { voltage: 0, current: 0, power: 0, pf: 0 },
      updatedAt: null
    };
  } catch (e) {
    return {
      voltage: 0.0, current: 0, power: 0, energy: 0, frequency: 0.0, powerFactor: 0.0,
      l1: { voltage: 0, current: 0, power: 0, pf: 0 },
      l2: { voltage: 0, current: 0, power: 0, pf: 0 },
      l3: { voltage: 0, current: 0, power: 0, pf: 0 },
      updatedAt: null
    };
  }
}

let pzemData = getStoredPzemData();

// =========================================================================
// 2. Mobile Sidebar Drawer
// =========================================================================
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

// =========================================================================
// 3. Toast Notifications & Browser Alerts
// =========================================================================
function showToast(type, title, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;

  const icons = { warning: '⚠️', danger: '🚨', success: '✅', info: 'ℹ️' };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || '🔔'}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4500);
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showToast('success', '🔔 เปิดการแจ้งเตือนแล้ว', 'ระบบพร้อมส่งข้อความเตือนเมื่อค่าเซ็นเซอร์ผิดปกติ');
      }
    });
  }
}

function sendBrowserNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body,
        icon: 'https://cdn-icons-png.flaticon.com/512/919/919830.png'
      });
    } catch (e) {
      console.warn('Browser Notification error:', e);
    }
  }
}

// =========================================================================
// 4. WebSocket Client (รับข้อมูล Real-time จาก Node-RED)
// =========================================================================
function updateConnectionStatus(status, message) {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSub = document.getElementById('statusSub');
  const wsUrl = getWsUrl();

  if (statusSub) statusSub.textContent = wsUrl;

  if (status === 'connected') {
    if (statusDot) statusDot.className = 'status-dot connected';
    if (statusText) statusText.textContent = message || 'เชื่อมต่อ Node-RED สำเร็จ';
  } else if (status === 'connecting') {
    if (statusDot) statusDot.className = 'status-dot';
    if (statusText) statusText.textContent = message || 'กำลังเชื่อมต่อ...';
  } else {
    if (statusDot) statusDot.className = 'status-dot';
    if (statusText) statusText.textContent = message || 'ขาดการเชื่อมต่อ (Offline)';
  }
}

function connectWebSocket() {
  const wsUrl = getWsUrl();
  updateConnectionStatus('connecting', 'กำลังเชื่อมต่อ...');

  try {
    if (ws) {
      try { ws.close(); } catch (e) { }
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = function () {
      updateConnectionStatus('connected', 'เชื่อมต่อ Node-RED สำเร็จ');
      console.log('Connected to Node-RED WebSocket:', wsUrl);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = function (event) {
      try {
        const data = JSON.parse(event.data);
        handleIncomingTelemetry(data);
      } catch (err) {
        console.warn('Non-JSON message received:', event.data);
      }
    };

    ws.onclose = function () {
      updateConnectionStatus('disconnected', 'ขาดการเชื่อมต่อ (Offline)');
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(connectWebSocket, 4000);
      }
    };

    ws.onerror = function (err) {
      console.error('WebSocket Error:', err);
      updateConnectionStatus('disconnected', 'เชื่อมต่อไม่ได้ (Offline)');
    };
  } catch (e) {
    console.error('WS Connection Exception:', e);
    updateConnectionStatus('disconnected', 'เกิดข้อผิดพลาด');
  }
}

function reconnectWs() {
  showToast('info', '🔄 กำลังเชื่อมต่อใหม่', 'เริ่มเชื่อมต่อไปยัง Node-RED WebSocket อีกครั้ง');
  connectWebSocket();
}

// รับข้อมูล Real-time ทั้งจาก WebSocket และ Simulation
function handleIncomingTelemetry(data) {
  const now = new Date();
  const timeStr = data.timeStr || now.toLocaleTimeString('th-TH');

  let temp = data.temperature !== undefined ? parseFloat(data.temperature) : null;
  let humi = data.humidity !== undefined ? parseFloat(data.humidity) : null;
  let light = data.light !== undefined ? parseFloat(data.light) : null;

  let volt = data.voltage !== undefined ? parseFloat(data.voltage) : (data.v !== undefined ? parseFloat(data.v) : null);
  let amp = data.current !== undefined ? parseFloat(data.current) : (data.i !== undefined ? parseFloat(data.i) : null);
  let watt = data.power !== undefined ? parseFloat(data.power) : (data.p !== undefined ? parseFloat(data.p) : null);
  let kwh = data.energy !== undefined ? parseFloat(data.energy) : (data.e !== undefined ? parseFloat(data.e) : null);

  // อัปเดต Cache PZEM
  if (volt !== null && !isNaN(volt)) pzemData.voltage = volt;
  if (amp !== null && !isNaN(amp)) pzemData.current = amp;
  if (watt !== null && !isNaN(watt)) pzemData.power = watt;
  if (kwh !== null && !isNaN(kwh)) pzemData.energy = kwh;

  if (data.l1) pzemData.l1 = data.l1;
  if (data.l2) pzemData.l2 = data.l2;
  if (data.l3) pzemData.l3 = data.l3;

  pzemData.updatedAt = timeStr;
  localStorage.setItem('pzem_cached_data', JSON.stringify(pzemData));

  // ตรวจสอบการแจ้งเตือน
  const th = getThresholds();
  let isAlert = false;
  if (temp !== null && temp > th.tempMax) {
    isAlert = true;
    showToast('danger', '🔥 อุณหภูมิสูงเกินเกณฑ์!', `ตรวจพบอุณหภูมิ ${temp.toFixed(1)} °C`);
  }

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const newLog = {
    id: allTelemetryLogs.length > 0 ? (allTelemetryLogs[0].id + 1) : 1,
    time: timeStr,
    date: dateStr,
    thaiDate: now.toLocaleDateString('th-TH'),
    timestamp: now.getTime(),
    temp: temp !== null ? temp.toFixed(1) : (allTelemetryLogs[0]?.temp || '--'),
    humi: humi !== null ? humi.toFixed(1) : (allTelemetryLogs[0]?.humi || '--'),
    light: light !== null ? Math.round(light) : (allTelemetryLogs[0]?.light || '--'),
    volt: volt !== null ? volt : pzemData.voltage,
    amp: amp !== null ? amp : pzemData.current,
    watt: watt !== null ? watt : pzemData.power,
    kwh: kwh !== null ? kwh : pzemData.energy,
    status: isAlert ? 'Alert' : 'Normal'
  };

  allTelemetryLogs.unshift(newLog);
  if (allTelemetryLogs.length > 500) allTelemetryLogs.pop();
  saveStoredLogs(allTelemetryLogs);
  updateBadgeCounts();

  // กระจาย Event ให้ทุกหน้าเว็บอัปเดต UI ทันที
  window.dispatchEvent(new CustomEvent('iot-telemetry', {
    detail: {
      temp, humi, light, volt: pzemData.voltage, amp: pzemData.current, watt: pzemData.power, kwh: pzemData.energy,
      timeStr, pzemData, newLog, allLogs: allTelemetryLogs
    }
  }));
}

function updateBadgeCounts() {
  const badge = document.getElementById('logsCountBadge');
  if (badge) badge.textContent = allTelemetryLogs.length;
}

// =========================================================================
// 5. API Client ดึงข้อมูลแยกเฉพาะฐานข้อมูล (iot_database & power_db)
// =========================================================================

// ดึงข้อมูลเซ็นเซอร์สิ่งแวดล้อม (iot_database -> sensor_data)
async function fetchSensorLogs() {
  try {
    const response = await fetch('/api/sensor-data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    return data.map((item, index) => {
      const createdDate = item.recorded_at ? new Date(item.recorded_at) : (item.created_at ? new Date(item.created_at) : new Date());
      return {
        id: item.id || (data.length - index),
        time: createdDate.toLocaleTimeString('th-TH'),
        date: createdDate.toISOString().split('T')[0],
        thaiDate: createdDate.toLocaleDateString('th-TH'),
        timestamp: createdDate.getTime(),
        temp: item.temperature ?? item.temp ?? '--',
        humi: item.humidity ?? item.humi ?? '--',
        light: item.light ?? item.ldr ?? '--',
        volt: '--', amp: '--', watt: '--', kwh: '--',
        status: 'Normal'
      };
    });
  } catch (err) {
    console.warn('⚠️ ไม่สามารถดึงข้อมูล /api/sensor-data ได้:', err.message);
    return [];
  }
}

// ดึงข้อมูลไฟฟ้า 3 เฟส (power_db -> pzem_3phase_logs)
async function fetchPowerLogs() {
  try {
    const response = await fetch('/api/energy-data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    return data.map((item, index) => {
      const createdDate = item.recorded_at ? new Date(item.recorded_at) : (item.device_time ? new Date(item.device_time) : new Date());
      return {
        id: item.id || (data.length - index),
        time: createdDate.toLocaleTimeString('th-TH'),
        date: createdDate.toISOString().split('T')[0],
        thaiDate: createdDate.toLocaleDateString('th-TH'),
        timestamp: createdDate.getTime(),
        phase_id: item.phase_id || 3,
        volt: item.voltage !== undefined ? parseFloat(item.voltage) : null,
        amp: item.current !== undefined ? parseFloat(item.current) : null,
        watt: item.power !== undefined ? parseFloat(item.power) : null,
        kwh: item.energy !== undefined ? parseFloat(item.energy) : null,
        status: 'Normal'
      };
    });
  } catch (err) {
    console.warn('⚠️ ไม่สามารถดึงข้อมูล /api/energy-data ได้:', err.message);
    return [];
  }
}

// ฟังก์ชันรวม ดึงทั้ง 2 DB เมื่อโหลดหน้าหลัก
async function loadDataFromNodeRed() {
  try {
    const [sensorData, powerData] = await Promise.all([fetchSensorLogs(), fetchPowerLogs()]);
    if (sensorData.length > 0) saveStoredLogs(sensorData);
    if (powerData.length > 0) {
      const latest = powerData[0];
      if (latest.volt !== null) pzemData.voltage = latest.volt;
      if (latest.amp !== null) pzemData.current = latest.amp;
      if (latest.watt !== null) pzemData.power = latest.watt;
      if (latest.kwh !== null) pzemData.energy = latest.kwh;
      localStorage.setItem('pzem_cached_data', JSON.stringify(pzemData));
    }
    updateBadgeCounts();
  } catch (e) {
    console.warn('Failed to load initial data:', e);
  }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  updateBadgeCounts();
  connectWebSocket();
  loadDataFromNodeRed();
});
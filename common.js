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
    // Keep up to 500 recent logs
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
      updatedAt: null
    };
  } catch (e) {
    return { voltage: 0.0, current: 0, power: 0, energy: 0, frequency: 0.0, powerFactor: 0.0, updatedAt: null };
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

  const icons = {
    warning: '⚠️',
    danger: '🚨',
    success: '✅',
    info: 'ℹ️'
  };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || '🔔'}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  // Auto remove after 4.5 seconds
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
// 4. WebSocket Client & Incoming Telemetry Processing
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
      try { ws.close(); } catch (e) {}
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

// Parse and normalize incoming sensor / PZEM data
function handleIncomingTelemetry(data) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('th-TH');

  let temp = data.temperature !== undefined ? parseFloat(data.temperature) : null;
  let humi = data.humidity !== undefined ? parseFloat(data.humidity) : null;
  let light = data.light !== undefined ? parseFloat(data.light) : null;

  if (data.topic === 'Temperature') temp = parseFloat(data.payload);
  if (data.topic === 'Humidity') humi = parseFloat(data.payload);
  if (data.topic === 'Light') light = parseFloat(data.payload);

  // PZEM-004T Electrical parameters
  let volt = data.voltage !== undefined ? parseFloat(data.voltage) : (data.volt !== undefined ? parseFloat(data.volt) : (data.v !== undefined ? parseFloat(data.v) : null));
  let amp = data.current !== undefined ? parseFloat(data.current) : (data.current_a !== undefined ? parseFloat(data.current_a) : (data.amp !== undefined ? parseFloat(data.amp) : (data.i !== undefined ? parseFloat(data.i) : null)));
  let watt = data.power !== undefined ? parseFloat(data.power) : (data.watt !== undefined ? parseFloat(data.watt) : (data.power_w !== undefined ? parseFloat(data.power_w) : (data.p !== undefined ? parseFloat(data.p) : null)));
  let kwh = data.energy !== undefined ? parseFloat(data.energy) : (data.kwh !== undefined ? parseFloat(data.kwh) : (data.energy_kwh !== undefined ? parseFloat(data.energy_kwh) : (data.e !== undefined ? parseFloat(data.e) : null)));
  let freq = data.frequency !== undefined ? parseFloat(data.frequency) : (data.freq !== undefined ? parseFloat(data.freq) : (data.hz !== undefined ? parseFloat(data.hz) : (data.f !== undefined ? parseFloat(data.f) : null)));
  let pf = data.pf !== undefined ? parseFloat(data.pf) : (data.power_factor !== undefined ? parseFloat(data.power_factor) : (data.powerFactor !== undefined ? parseFloat(data.powerFactor) : null));

  if (data.topic === 'Voltage') volt = parseFloat(data.payload);
  if (data.topic === 'Current') amp = parseFloat(data.payload);
  if (data.topic === 'Power') watt = parseFloat(data.payload);
  if (data.topic === 'Energy') kwh = parseFloat(data.payload);
  if (data.topic === 'Frequency') freq = parseFloat(data.payload);
  if (data.topic === 'PowerFactor') pf = parseFloat(data.payload);

  // Cache PZEM data if any electrical fields present
  let hasPzem = (volt !== null && !isNaN(volt)) || (amp !== null && !isNaN(amp)) || (watt !== null && !isNaN(watt)) || (kwh !== null && !isNaN(kwh));
  if (hasPzem) {
    if (volt !== null && !isNaN(volt)) pzemData.voltage = volt;
    if (amp !== null && !isNaN(amp)) pzemData.current = amp;
    if (watt !== null && !isNaN(watt)) pzemData.power = watt;
    if (kwh !== null && !isNaN(kwh)) pzemData.energy = kwh;
    if (freq !== null && !isNaN(freq)) pzemData.frequency = freq;
    if (pf !== null && !isNaN(pf)) pzemData.powerFactor = pf;
    pzemData.updatedAt = timeStr;
    localStorage.setItem('pzem_cached_data', JSON.stringify(pzemData));
  }

  // Check alert thresholds
  const th = getThresholds();
  let isAlert = false;
  if (temp !== null && temp > th.tempMax) {
    isAlert = true;
    showToast('danger', '🔥 อุณหภูมิสูงเกินเกณฑ์!', `ตรวจพบอุณหภูมิ ${temp.toFixed(1)} °C (เกณฑ์: ${th.tempMax} °C)`);
    sendBrowserNotification('🔥 แจ้งเตือนอุณหภูมิสูง', `อุณหภูมิแตะระดับ ${temp.toFixed(1)} °C`);
  }
  if (humi !== null && humi > th.humiMax) {
    isAlert = true;
    showToast('warning', '💧 ความชื้นสูงเกินเกณฑ์!', `ตรวจพบความชื้น ${humi.toFixed(1)} % (เกณฑ์: ${th.humiMax} %)`);
  }
  if (light !== null && light < th.lightMin) {
    isAlert = true;
    showToast('warning', '🌑 แสงสว่างไม่เพียงพอ!', `ระดับแสง ${Math.round(light)} lux (เกณฑ์: ${th.lightMin} lux)`);
  }

  // Record log
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const thaiDateStr = now.toLocaleDateString('th-TH');

  const newLog = {
    id: allTelemetryLogs.length > 0 ? (allTelemetryLogs[0].id + 1) : 1,
    time: timeStr,
    date: dateStr,              // Format YYYY-MM-DD for date filtering
    thaiDate: thaiDateStr,
    timestamp: now.getTime(),
    temp: temp !== null ? temp.toFixed(1) : (allTelemetryLogs[0]?.temp || '--'),
    humi: humi !== null ? humi.toFixed(1) : (allTelemetryLogs[0]?.humi || '--'),
    light: light !== null ? Math.round(light) : (allTelemetryLogs[0]?.light || '--'),
    volt: volt !== null ? volt : (pzemData.voltage || null),
    amp: amp !== null ? amp : (pzemData.current || null),
    watt: watt !== null ? watt : (pzemData.power || null),
    kwh: kwh !== null ? kwh : (pzemData.energy || null),
    status: isAlert ? 'Alert' : 'Normal'
  };

  allTelemetryLogs.unshift(newLog);
  if (allTelemetryLogs.length > 500) allTelemetryLogs.pop();
  saveStoredLogs(allTelemetryLogs);

  // Update badge count
  updateBadgeCounts();

  // Dispatch custom event for page listeners
  const payload = {
    temp, humi, light,
    volt, amp, watt, kwh, freq, pf,
    timeStr,
    pzemData,
    newLog,
    allLogs: allTelemetryLogs
  };

  window.dispatchEvent(new CustomEvent('iot-telemetry', { detail: payload }));
}

function updateBadgeCounts() {
  const badge = document.getElementById('logsCountBadge');
  if (badge) {
    badge.textContent = allTelemetryLogs.length;
  }
}

// Simulation helper (เฉพาะข้อมูลสิ่งแวดล้อม DHT22 / LDR ไม่จำลอง PZEM-004T)
function simulateData() {
  const mockTemp = (26.0 + (Math.random() * 8 - 3)).toFixed(1);
  const mockHumi = (50.0 + (Math.random() * 20 - 8)).toFixed(1);
  const mockLight = Math.round(350 + (Math.random() * 400 - 150));

  const mockPayload = {
    temperature: parseFloat(mockTemp),
    humidity: parseFloat(mockHumi),
    light: mockLight
  };

  handleIncomingTelemetry(mockPayload);
  showToast('info', '🌡️ จำลองข้อมูลเซ็นเซอร์สำเร็จ', `อุณหภูมิ: ${mockTemp}°C, ความชื้น: ${mockHumi}%, แสง: ${mockLight} lx`);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  updateBadgeCounts();
  connectWebSocket();
});

const fs = require('fs/promises');
const path = require('path');
const pool = require('../config/db');

const state = {
  enabled: false,
  time: '02:00',
  types: ['occupancy', 'revenue', 'users'],
  exportDir: '',
  lastRunAt: null,
  nextRunAt: null,
  lastStatus: 'never',
  lastError: null,
  lastFiles: [],
};

function parseTypes(raw) {
  const list = (raw || 'occupancy,revenue,users')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : ['occupancy', 'revenue', 'users'];
}

function resolveExportDir(dir) {
  const base = path.resolve(__dirname, '..', '..');
  if (!dir) return path.join(base, 'exports');
  if (path.isAbsolute(dir)) return dir;
  return path.join(base, dir);
}

function getConfig() {
  return {
    enabled: String(process.env.REPORT_EXPORT_ENABLED || '').toLowerCase() === 'true',
    time: process.env.REPORT_EXPORT_TIME || '02:00',
    types: parseTypes(process.env.REPORT_EXPORT_TYPES),
    exportDir: resolveExportDir(process.env.REPORT_EXPORT_DIR),
  };
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function formatDisplayDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatDisplayDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${formatDisplayDate(date)} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function escapeCsv(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

async function writeCsv(filePath, headers, rows) {
  const lines = [];
  lines.push(headers.map(escapeCsv).join(','));
  rows.forEach((row) => {
    lines.push(row.map(escapeCsv).join(','));
  });
  await fs.writeFile(filePath, lines.join('\n'), 'utf8');
}

async function exportOccupancy(dir, stamp) {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS total
     FROM parking_slots
     GROUP BY status`
  );
  const filePath = path.join(dir, `occupancy_${stamp}.csv`);
  const data = rows.map((row) => [row.status, row.total]);
  await writeCsv(filePath, ['status', 'total_slots'], data);
  return filePath;
}

async function exportRevenue(dir, stamp) {
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS day, IFNULL(SUM(amount), 0) AS total
     FROM payments
     WHERE status = 'paid'
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(created_at)
     ORDER BY day ASC`
  );
  const filePath = path.join(dir, `revenue_${stamp}.csv`);
  const data = rows.map((row) => [formatDisplayDate(row.day), row.total]);
  await writeCsv(filePath, ['day', 'total_revenue'], data);
  return filePath;
}

async function exportUsers(dir, stamp) {
  const [rows] = await pool.query(
    `SELECT public_user_id AS user_code, name, email, user_type, status, created_at
     FROM users
     ORDER BY created_at DESC`
  );
  const filePath = path.join(dir, `users_${stamp}.csv`);
  const data = rows.map((row) => [
    row.user_code,
    row.name,
    row.email,
    row.user_type,
    row.status,
    formatDisplayDateTime(row.created_at),
  ]);
  await writeCsv(filePath, ['user_code', 'name', 'email', 'role', 'status', 'created_at'], data);
  return filePath;
}

async function runReportExport() {
  const config = getConfig();
  state.enabled = config.enabled;
  state.time = config.time;
  state.types = config.types;
  state.exportDir = config.exportDir;

  const stamp = formatDateKey(new Date());
  await fs.mkdir(config.exportDir, { recursive: true });

  const files = [];
  for (const type of config.types) {
    if (type === 'occupancy') {
      const file = await exportOccupancy(config.exportDir, stamp);
      files.push({ type, file });
    }
    if (type === 'revenue') {
      const file = await exportRevenue(config.exportDir, stamp);
      files.push({ type, file });
    }
    if (type === 'users') {
      const file = await exportUsers(config.exportDir, stamp);
      files.push({ type, file });
    }
  }

  state.lastRunAt = new Date().toISOString();
  state.lastStatus = 'success';
  state.lastError = null;
  state.lastFiles = files;
  return { ran_at: state.lastRunAt, files };
}

function computeNextRun(time) {
  const parts = String(time || '02:00').split(':');
  const hours = Number(parts[0] || 0);
  const minutes = Number(parts[1] || 0);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function scheduleNextRun() {
  if (!state.enabled) return;
  const next = computeNextRun(state.time);
  state.nextRunAt = next.toISOString();
  const delay = Math.max(next.getTime() - Date.now(), 1000);

  setTimeout(async () => {
    try {
      await runReportExport();
    } catch (err) {
      state.lastStatus = 'failed';
      state.lastError = err.message;
    }
    scheduleNextRun();
  }, delay);
}

function startReportScheduler() {
  const config = getConfig();
  state.enabled = config.enabled;
  state.time = config.time;
  state.types = config.types;
  state.exportDir = config.exportDir;

  if (!state.enabled) return;
  scheduleNextRun();
}

function getReportScheduleStatus() {
  const config = getConfig();
  return {
    enabled: config.enabled,
    time: config.time,
    types: config.types,
    export_dir: config.exportDir,
    last_run_at: state.lastRunAt,
    next_run_at: state.nextRunAt,
    last_status: state.lastStatus,
    last_error: state.lastError,
    last_files: state.lastFiles,
  };
}

module.exports = {
  startReportScheduler,
  getReportScheduleStatus,
  runReportExport,
};

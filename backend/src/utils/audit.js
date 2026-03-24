const pool = require('../config/db');

async function logAdminAction({ req, action, entityType, entityId, details }) {
  try {
    if (!req?.user?.id) return;
    const payload = details ? JSON.stringify(details) : null;
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        action,
        entityType,
        entityId || null,
        payload,
        req.ip || null,
        req.headers['user-agent'] || null,
      ]
    );
  } catch (err) {
    // Avoid blocking the main request on audit failures.
    // eslint-disable-next-line no-console
    console.warn('Audit log failed:', err.message);
  }
}

module.exports = { logAdminAction };

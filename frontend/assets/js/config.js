(() => {
  const runtime = window.RUNTIME_CONFIG || {};
  const host = window.location.hostname || 'localhost';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const explicitBase = String(runtime.API_BASE || '').trim().replace(/\/$/, '');
  const localHosts = ['localhost', '127.0.0.1'].includes(host);
  const defaultApiBase = explicitBase || (localHosts ? `${protocol}//${host}:4000` : window.location.origin);

  window.APP_CONFIG = {
    API_BASE: defaultApiBase,
    PAYMENT_HOLD_SECONDS: Number(runtime.PAYMENT_HOLD_SECONDS || 120),
    MPESA_ENABLED: Boolean(runtime.MPESA_ENABLED),
  };
})();

(() => {
  const host = window.location.hostname || 'localhost';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const port = 4000;

  window.APP_CONFIG = {
    API_BASE: `${protocol}//${host}:${port}`,
    PAYMENT_HOLD_SECONDS: 120,
  };
})();

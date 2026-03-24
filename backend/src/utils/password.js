const DEFAULT_RULES = {
  minLength: Number(process.env.PASSWORD_MIN_LENGTH || 8),
  requireUpper: process.env.PASSWORD_REQUIRE_UPPER !== 'false',
  requireLower: process.env.PASSWORD_REQUIRE_LOWER !== 'false',
  requireNumber: process.env.PASSWORD_REQUIRE_NUMBER !== 'false',
  requireSpecial: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
};

function checkPasswordStrength(password, rules = DEFAULT_RULES) {
  const issues = [];
  if (!password || password.length < rules.minLength) {
    issues.push(`at least ${rules.minLength} characters`);
  }
  if (rules.requireUpper && !/[A-Z]/.test(password)) {
    issues.push('one uppercase letter');
  }
  if (rules.requireLower && !/[a-z]/.test(password)) {
    issues.push('one lowercase letter');
  }
  if (rules.requireNumber && !/[0-9]/.test(password)) {
    issues.push('one number');
  }
  if (rules.requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    issues.push('one special character');
  }

  if (issues.length) {
    return {
      ok: false,
      message: `Password must contain ${issues.join(', ')}.`,
    };
  }
  return { ok: true };
}

module.exports = { checkPasswordStrength };

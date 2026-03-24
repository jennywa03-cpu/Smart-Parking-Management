const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const list = errors.array();
    return res.status(422).json({
      message: list[0]?.msg || 'Validation failed',
      errors: list,
    });
  }
  return next();
}

module.exports = validate;

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.path}`, err);
  }

  res.status(status).json({ error: message });
}

module.exports = errorHandler;

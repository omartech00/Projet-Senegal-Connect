const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-at-least-64-chars-long';

const verifierJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erreur: 'Token manquant' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ erreur: 'Token expire — veuillez vous reconnecter' });
    }
    return res.status(401).json({ erreur: 'Token invalide' });
  }
};

const garderRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ erreur: 'Token manquant' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ erreur: 'Acces refuse — role insuffisant' });
    }
    next();
  };
};

module.exports = { verifierJWT, garderRole };

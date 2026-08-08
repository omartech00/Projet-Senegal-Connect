const logger = require('../config/logger');

const handler404 = (req, res) => {
  res.status(404).json({ erreur: `Route non trouvee: ${req.method} ${req.originalUrl}` });
};

const handlerErreurs = (err, req, res, _next) => {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(422).json({ erreur: 'Fichier trop volumineux — taille maximale 10 Mo' });
    }
    return res.status(422).json({ erreur: err.message });
  }

  if (err.message && err.message.startsWith('Type de fichier non autorise')) {
    return res.status(422).json({ erreur: err.message });
  }

  if (err.code === '23505') {
    return res.status(409).json({ erreur: 'Doublon detecte', detail: err.detail || '' });
  }

  if (err.code === '23503') {
    return res.status(422).json({ erreur: 'Reference invalide — ressource associee introuvable' });
  }

  if (err.code === '23514') {
    return res.status(422).json({ erreur: 'Violation de contrainte', detail: err.detail });
  }

  logger.error(`Erreur non geree: ${err.message}`, { stack: err.stack });

  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ erreur: 'Erreur interne du serveur' });
  }

  return res.status(500).json({ erreur: err.message, stack: err.stack });
};

module.exports = { handler404, handlerErreurs };

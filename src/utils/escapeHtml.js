// src/utils/escapeHtml.js
// Rôle : assainir le contenu d'un message avant insertion en BDD,
// pour empêcher toute injection HTML/JS affichée ensuite chez un
// autre utilisateur (faille XSS classique en messagerie temps réel).
// Exigence explicite du PDF, section M2.

function escapeHtml(texte) {
  if (typeof texte !== 'string') return texte;
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = escapeHtml;

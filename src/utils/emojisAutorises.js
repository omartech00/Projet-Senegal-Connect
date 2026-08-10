// src/utils/emojisAutorises.js
// Rôle : liste blanche des émojis acceptés en réaction (et comme
// contenu de message emoji-seul, Phase 20). Exigence du PDF : minimum
// 12 émojis côté sélecteur — je fixe ici la liste exacte acceptée
// côté serveur, pour ne jamais stocker une chaîne arbitraire dans la
// colonne "emoji" (défense contre les données non prévues).

const EMOJIS_AUTORISES = [
  '👍', '👎', '😂', '❤️', '😮', '😢', '😡', '🙏', '👏', '🔥', '✅', '🎉',
];

function estEmojiAutorise(emoji) {
  return EMOJIS_AUTORISES.includes(emoji);
}

module.exports = { EMOJIS_AUTORISES, estEmojiAutorise };

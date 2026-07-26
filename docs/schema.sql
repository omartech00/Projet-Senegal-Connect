-- ============================================================
-- docs/schema.sql
-- Rôle : schéma PostgreSQL complet de Sénégal Connect.
-- Contient : 8 tables métier officielles (section 2.4 du cahier
-- des charges) + 1 table technique "reactions" (nécessaire au
-- module M3, décision actée en Phase 0/7), contraintes CHECK/FK/
-- UNIQUE, index, triggers de cohérence de rôle, et données de test
-- (4 forfaits + 5 clients, conforme section 3.2).
--
-- Exécution : psql -U senegal_connect_user -d senegal_connect -f docs/schema.sql
-- Sera aussi monté dans docker-entrypoint-initdb.d/ (Phase 31) —
-- exécuté une seule fois par PostgreSQL, sur une base vide.
--
-- Mot de passe en clair de TOUS les utilisateurs de test : Test1234!
-- (hash bcrypt coût 12, généré et vérifié via bcryptjs)
-- ============================================================

-- Nettoyage (utile en développement pour ré-exécuter le script ;
-- sans effet en Docker puisque la base y est toujours vide au 1er run)
DROP TABLE IF EXISTS reactions, appels, messages_statut, messages,
  tickets, factures, clients, forfaits, utilisateurs CASCADE;

-- ============================================================
-- TABLE 1 : utilisateurs
-- Rôle : compte de connexion (client, agent ou admin). Le mot de
-- passe n'est JAMAIS stocké en clair (bcrypt, coût >= 12, Phase 12).
-- ============================================================
CREATE TABLE utilisateurs (
  id             BIGSERIAL PRIMARY KEY,
  nom            VARCHAR(100) NOT NULL,
  prenom         VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  mot_de_passe   VARCHAR(255) NOT NULL,
  role           VARCHAR(20)  NOT NULL CHECK (role IN ('client', 'agent', 'admin')),
  cree_le        TIMESTAMP NOT NULL DEFAULT NOW()
);
-- email : index déjà créé automatiquement par la contrainte UNIQUE
CREATE INDEX idx_utilisateurs_role ON utilisateurs(role);

-- ============================================================
-- TABLE 2 : forfaits
-- Rôle : offres commerciales. Prix > 0, quotas >= 0 (règles métier
-- de la section 2.1, vérifiées ici en base ET par express-validator
-- en Phase 14).
-- ============================================================
CREATE TABLE forfaits (
  id                 BIGSERIAL PRIMARY KEY,
  nom                VARCHAR(100) NOT NULL,
  quota_data_go      NUMERIC(6,2)  NOT NULL CHECK (quota_data_go >= 0),
  quota_voix_min     INTEGER       NOT NULL CHECK (quota_voix_min >= 0),
  prix_mensuel_fcfa  NUMERIC(10,2) NOT NULL CHECK (prix_mensuel_fcfa > 0),
  actif              BOOLEAN       NOT NULL DEFAULT true
);
CREATE INDEX idx_forfaits_actif ON forfaits(actif);

-- ============================================================
-- TABLE 3 : clients
-- Rôle : fiche abonné télécom, liée 1-pour-1 à un utilisateur
-- (role='client', vérifié par trigger ci-dessous). MSISDN au
-- format sénégalais strict +221XXXXXXXXX.
-- ============================================================
CREATE TABLE clients (
  id                BIGSERIAL PRIMARY KEY,
  utilisateur_id    BIGINT NOT NULL UNIQUE
                     REFERENCES utilisateurs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  msisdn            VARCHAR(13) NOT NULL UNIQUE
                     CHECK (msisdn ~ '^\+221[0-9]{9}$'),
  forfait_id        BIGINT
                     REFERENCES forfaits(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  statut            VARCHAR(20) NOT NULL DEFAULT 'actif'
                     CHECK (statut IN ('actif', 'suspendu', 'resilie')),
  date_inscription  DATE NOT NULL DEFAULT CURRENT_DATE
);
-- msisdn : index déjà créé automatiquement par la contrainte UNIQUE
CREATE INDEX idx_clients_forfait_id ON clients(forfait_id);
CREATE INDEX idx_clients_statut ON clients(statut);

-- ============================================================
-- TABLE 4 : factures
-- Rôle : facturation mensuelle d'un client. Référence unique
-- générée côté Node (Phase 16, pas ici — voir justification en
-- section 4 de cette phase).
-- ============================================================
CREATE TABLE factures (
  id             BIGSERIAL PRIMARY KEY,
  client_id      BIGINT NOT NULL
                  REFERENCES clients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  reference      VARCHAR(20) NOT NULL UNIQUE,
  periode        VARCHAR(7) NOT NULL
                  CHECK (periode ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  montant_fcfa   NUMERIC(12,2) NOT NULL CHECK (montant_fcfa >= 0),
  statut         VARCHAR(20) NOT NULL DEFAULT 'impayee'
                  CHECK (statut IN ('payee', 'impayee', 'en_retard')),
  date_emission  DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance  DATE NOT NULL
);
CREATE INDEX idx_factures_client_id ON factures(client_id);
CREATE INDEX idx_factures_statut ON factures(statut);
CREATE INDEX idx_factures_periode ON factures(periode);

-- ============================================================
-- TABLE 5 : tickets
-- Rôle : ticket de support client. agent_id nullable (tant que
-- personne ne s'est encore assigné le ticket, événement
-- "ticket:assigner", Phase 20).
-- ============================================================
CREATE TABLE tickets (
  id          BIGSERIAL PRIMARY KEY,
  client_id   BIGINT NOT NULL
              REFERENCES clients(id) ON DELETE CASCADE ON UPDATE CASCADE,
  agent_id    BIGINT
              REFERENCES utilisateurs(id) ON DELETE SET NULL ON UPDATE CASCADE,
  sujet       VARCHAR(255) NOT NULL,
  statut      VARCHAR(20) NOT NULL DEFAULT 'ouvert'
              CHECK (statut IN ('ouvert', 'en_cours', 'ferme')),
  ouvert_le   TIMESTAMP NOT NULL DEFAULT NOW(),
  ferme_le    TIMESTAMP
);
CREATE INDEX idx_tickets_client_id ON tickets(client_id);
CREATE INDEX idx_tickets_agent_id ON tickets(agent_id);
CREATE INDEX idx_tickets_statut ON tickets(statut);

-- ============================================================
-- TABLE 6 : messages
-- Rôle : messages du chat de support (texte, fichier, image, audio).
-- ============================================================
CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  ticket_id       BIGINT NOT NULL
                   REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
  expediteur_id   BIGINT NOT NULL
                   REFERENCES utilisateurs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  type            VARCHAR(20) NOT NULL
                   CHECK (type IN ('texte', 'fichier', 'image', 'audio')),
  contenu         TEXT,
  fichier_url     VARCHAR(500),
  fichier_nom     VARCHAR(255),
  fichier_taille  INTEGER,
  envoye_le       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_ticket_id ON messages(ticket_id);
CREATE INDEX idx_messages_envoye_le ON messages(envoye_le DESC);

-- ============================================================
-- TABLE 7 : messages_statut
-- Rôle : accusés de réception (✓ envoyé / ✓✓ lu). PK composite :
-- un seul statut par (message, utilisateur).
-- ============================================================
CREATE TABLE messages_statut (
  message_id      BIGINT NOT NULL
                   REFERENCES messages(id) ON DELETE CASCADE ON UPDATE CASCADE,
  utilisateur_id  BIGINT NOT NULL
                   REFERENCES utilisateurs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  statut          VARCHAR(20) NOT NULL CHECK (statut IN ('envoye', 'lu')),
  lu_le           TIMESTAMP,
  PRIMARY KEY (message_id, utilisateur_id)
);
CREATE INDEX idx_messages_statut_message_id ON messages_statut(message_id);

-- ============================================================
-- TABLE 8 : appels
-- Rôle : historique des appels audio/vidéo (signalisation WebRTC,
-- Phase 25-29). Le flux média lui-même ne passe jamais par le
-- serveur ; seule la métadonnée de l'appel est ici.
-- ============================================================
CREATE TABLE appels (
  id               BIGSERIAL PRIMARY KEY,
  ticket_id        BIGINT NOT NULL
                    REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
  initiateur_id    BIGINT NOT NULL
                    REFERENCES utilisateurs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  destinataire_id  BIGINT NOT NULL
                    REFERENCES utilisateurs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  type             VARCHAR(10) NOT NULL CHECK (type IN ('audio', 'video')),
  statut           VARCHAR(20) NOT NULL DEFAULT 'initie'
                    CHECK (statut IN ('initie', 'accepte', 'refuse', 'termine')),
  duree_secondes   INTEGER NOT NULL DEFAULT 0 CHECK (duree_secondes >= 0),
  debut_le         TIMESTAMP NOT NULL DEFAULT NOW(),
  fin_le           TIMESTAMP
);
CREATE INDEX idx_appels_ticket_id ON appels(ticket_id);
CREATE INDEX idx_appels_statut ON appels(statut);

-- ============================================================
-- TABLE 9 (technique) : reactions
-- Rôle : réactions emoji sur un message (M3). Absente du tableau
-- des "8 tables" du PDF mais exigée fonctionnellement — ajoutée
-- ici et documentée comme extension (voir rapport technique).
-- PK sur les 3 colonnes : un utilisateur peut poser plusieurs
-- émojis différents sur le même message, chacun togglable
-- indépendamment (clic = ajoute, re-clic sur le même = retire).
-- ============================================================
CREATE TABLE reactions (
  message_id      BIGINT NOT NULL
                   REFERENCES messages(id) ON DELETE CASCADE ON UPDATE CASCADE,
  utilisateur_id  BIGINT NOT NULL
                   REFERENCES utilisateurs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  emoji           VARCHAR(8) NOT NULL,
  reagi_le        TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, utilisateur_id, emoji)
);
CREATE INDEX idx_reactions_message_id ON reactions(message_id);

-- ============================================================
-- TRIGGERS de cohérence de rôle
-- Rôle : garantir en base (dernière ligne de défense, même si un
-- bug applicatif contournait la validation Node) que clients.
-- utilisateur_id référence toujours un role='client', et que
-- tickets.agent_id référence toujours un role IN ('agent','admin').
-- ============================================================
CREATE OR REPLACE FUNCTION verifier_role_client() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM utilisateurs WHERE id = NEW.utilisateur_id AND role = 'client'
  ) THEN
    RAISE EXCEPTION 'utilisateur_id % doit référencer un utilisateur avec role=client', NEW.utilisateur_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_role_client
BEFORE INSERT OR UPDATE OF utilisateur_id ON clients
FOR EACH ROW EXECUTE FUNCTION verifier_role_client();

CREATE OR REPLACE FUNCTION verifier_role_agent() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM utilisateurs WHERE id = NEW.agent_id AND role IN ('agent', 'admin')
  ) THEN
    RAISE EXCEPTION 'agent_id % doit référencer un utilisateur avec role=agent ou admin', NEW.agent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_role_agent
BEFORE INSERT OR UPDATE OF agent_id ON tickets
FOR EACH ROW EXECUTE FUNCTION verifier_role_agent();

-- ============================================================
-- DONNÉES DE TEST
-- 1 admin (pour pouvoir se connecter et tester les routes
-- protégées Admin dès la Phase 12, puisque /register force
-- toujours role=client) + 5 clients + 4 forfaits.
-- ============================================================

-- Admin de test — email: admin@senegalconnect.sn / mot de passe: Test1234!
INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role) VALUES
('Diallo', 'Admin', 'admin@senegalconnect.sn', '$2b$12$ItXUUkXNboaN04iu6MGLGu/fGtOkaJe/2MJBCOWeQp9dlZdrmS7NC', 'admin');

-- 4 forfaits
INSERT INTO forfaits (nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa, actif) VALUES
('Sénégal Connect Essentiel', 5,   60,   4000,  true),
('Sénégal Connect Confort',   15,  200,  9000,  true),
('Sénégal Connect Illimité',  50,  1000, 20000, true),
('Sénégal Connect Pro',       100, 3000, 35000, true);

-- 5 utilisateurs clients (même mot de passe de test: Test1234!)
INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role) VALUES
('Ndiaye', 'Fatou',   'fatou.ndiaye@example.sn',   '$2b$12$ItXUUkXNboaN04iu6MGLGu/fGtOkaJe/2MJBCOWeQp9dlZdrmS7NC', 'client'),
('Diop',   'Moussa',  'moussa.diop@example.sn',    '$2b$12$ItXUUkXNboaN04iu6MGLGu/fGtOkaJe/2MJBCOWeQp9dlZdrmS7NC', 'client'),
('Sarr',   'Aminata', 'aminata.sarr@example.sn',   '$2b$12$ItXUUkXNboaN04iu6MGLGu/fGtOkaJe/2MJBCOWeQp9dlZdrmS7NC', 'client'),
('Fall',   'Ibrahima','ibrahima.fall@example.sn',  '$2b$12$ItXUUkXNboaN04iu6MGLGu/fGtOkaJe/2MJBCOWeQp9dlZdrmS7NC', 'client'),
('Ba',     'Awa',     'awa.ba@example.sn',         '$2b$12$ItXUUkXNboaN04iu6MGLGu/fGtOkaJe/2MJBCOWeQp9dlZdrmS7NC', 'client');

-- 5 fiches clients liées aux utilisateurs ci-dessus (ids 2 à 6,
-- l'admin ayant pris l'id 1) et aux 4 forfaits (ids 1 à 4)
INSERT INTO clients (utilisateur_id, msisdn, forfait_id, statut, date_inscription) VALUES
(2, '+221771234501', 1, 'actif',    '2025-09-01'),
(3, '+221771234502', 2, 'actif',    '2025-09-15'),
(4, '+221771234503', 3, 'suspendu', '2025-10-01'),
(5, '+221771234504', 2, 'actif',    '2025-10-10'),
(6, '+221771234505', 4, 'resilie',  '2025-08-20');

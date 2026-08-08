BEGIN;

CREATE TABLE IF NOT EXISTS utilisateurs (
    id            SERIAL PRIMARY KEY,
    nom           VARCHAR(100) NOT NULL,
    prenom        VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    mot_de_passe  VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (role IN ('client','agent','admin')),
    cree_le       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(email);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_role  ON utilisateurs(role);

CREATE TABLE IF NOT EXISTS forfaits (
    id                SERIAL PRIMARY KEY,
    nom               VARCHAR(100) NOT NULL,
    quota_data_go     NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (quota_data_go >= 0),
    quota_voix_min    INTEGER NOT NULL DEFAULT 0 CHECK (quota_voix_min >= 0),
    prix_mensuel_fcfa NUMERIC(12,2) NOT NULL CHECK (prix_mensuel_fcfa > 0),
    actif             BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_forfaits_actif ON forfaits(actif);

CREATE TABLE IF NOT EXISTS clients (
    id               SERIAL PRIMARY KEY,
    utilisateur_id   INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    msisdn           VARCHAR(13) NOT NULL UNIQUE CHECK (msisdn ~ '^\+221[0-9]{9}$'),
    forfait_id       INTEGER REFERENCES forfaits(id) ON DELETE SET NULL,
    statut           VARCHAR(20) NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','suspendu','resilie')),
    date_inscription TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_msisdn     ON clients(msisdn);
CREATE INDEX IF NOT EXISTS idx_clients_forfait_id ON clients(forfait_id);
CREATE INDEX IF NOT EXISTS idx_clients_statut     ON clients(statut);

CREATE TABLE IF NOT EXISTS factures (
    id             SERIAL PRIMARY KEY,
    client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    reference      VARCHAR(20) NOT NULL UNIQUE,
    periode        VARCHAR(7) NOT NULL CHECK (periode ~ '^[0-9]{4}-[0-9]{2}$'),
    montant_fcfa   NUMERIC(12,2) NOT NULL CHECK (montant_fcfa >= 0),
    statut         VARCHAR(20) NOT NULL DEFAULT 'impayee' CHECK (statut IN ('payee','impayee','en_retard')),
    date_emission  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_echeance  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_factures_client_id ON factures(client_id);
CREATE INDEX IF NOT EXISTS idx_factures_statut    ON factures(statut);
CREATE INDEX IF NOT EXISTS idx_factures_periode   ON factures(periode);

CREATE TABLE IF NOT EXISTS tickets (
    id        SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    agent_id  INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
    sujet     VARCHAR(255) NOT NULL,
    statut    VARCHAR(20) NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','en_cours','ferme')),
    ouvert_le TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ferme_le  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_agent_id  ON tickets(agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_statut    ON tickets(statut);

CREATE TABLE IF NOT EXISTS messages (
    id             SERIAL PRIMARY KEY,
    ticket_id      INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    expediteur_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    type           VARCHAR(20) NOT NULL DEFAULT 'texte' CHECK (type IN ('texte','fichier','image','audio')),
    contenu        TEXT,
    fichier_url    VARCHAR(500),
    fichier_nom    VARCHAR(255),
    fichier_taille BIGINT,
    envoye_le      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_envoye_le ON messages(envoye_le DESC);

CREATE TABLE IF NOT EXISTS messages_statut (
    message_id     INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    statut         VARCHAR(10) NOT NULL DEFAULT 'envoye' CHECK (statut IN ('envoye','lu')),
    lu_le          TIMESTAMPTZ,
    PRIMARY KEY (message_id, utilisateur_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_statut_message_id ON messages_statut(message_id);

CREATE TABLE IF NOT EXISTS appels (
    id               SERIAL PRIMARY KEY,
    ticket_id        INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    initiateur_id    INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    destinataire_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    type             VARCHAR(10) NOT NULL CHECK (type IN ('audio','video')),
    statut           VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','accepte','refuse','termine')),
    duree_secondes   INTEGER,
    debut_le         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fin_le           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_appels_ticket_id ON appels(ticket_id);
CREATE INDEX IF NOT EXISTS idx_appels_statut   ON appels(statut);

INSERT INTO forfaits (nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa, actif) VALUES
    ('Yewwi 1Go',      1,    60,  1000, TRUE),
    ('Yewwi 5Go',      5,   300,  5000, TRUE),
    ('Yewwi 10Go',    10,   600, 10000, TRUE),
    ('Yewwi Illimite', 50, 99999, 25000, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role) VALUES
    ('Diallo',  'Amadou',   'admin@senegalconnect.sn',   '$2b$12$5ePRT4x3NgGmGmJyNNjXqOSOf2FCx2M8naoAKsMVduXqH64PqFmYO', 'admin'),
    ('Ndiaye',  'Fatou',    'fatou.ndiaye@sc.sn',         '$2b$12$5ePRT4x3NgGmGmJyNNjXqOSOf2FCx2M8naoAKsMVduXqH64PqFmYO', 'agent'),
    ('Sow',     'Moussa',   'moussa.sow@sc.sn',          '$2b$12$5ePRT4x3NgGmGmJyNNjXqOSOf2FCx2M8naoAKsMVduXqH64PqFmYO', 'agent'),
    ('Fall',    'Ousmane',  'ousmane.fall@gmail.com',    '$2b$12$5ePRT4x3NgGmGmJyNNjXqOSOf2FCx2M8naoAKsMVduXqH64PqFmYO', 'client'),
    ('Ba',      'Aissatou', 'aissatou.ba@yahoo.fr',      '$2b$12$5ePRT4x3NgGmGmJyNNjXqOSOf2FCx2M8naoAKsMVduXqH64PqFmYO', 'client'),
    ('Gueye',   'Ibrahima', 'ibrahima.gueye@hotmail.com','$2b$12$5ePRT4x3NgGmGmJyNNjXqOSOf2FCx2M8naoAKsMVduXqH64PqFmYO', 'client'),
    ('Diop',    'Mariama',  'mariama.diop@outlook.com',  '$2b$12$5ePRT4x3NgGmGmJyNNjXqOSOf2FCx2M8naoAKsMVduXqH64PqFmYO', 'client'),
    ('Mbaye',   'Cheikh',   'cheikh.mbaye@gmail.com',    '$2b$12$5ePRT4x3NgGmGmJyNNjXqOSOf2FCx2M8naoAKsMVduXqH64PqFmYO', 'client')
ON CONFLICT DO NOTHING;

INSERT INTO clients (utilisateur_id, msisdn, forfait_id, statut) VALUES
    (4, '+221771234567', 2, 'actif'),
    (5, '+221782345678', 1, 'actif'),
    (6, '+221763456789', 3, 'actif'),
    (7, '+221704567890', 2, 'suspendu'),
    (8, '+221715678901', NULL, 'actif')
ON CONFLICT DO NOTHING;

INSERT INTO factures (client_id, reference, periode, montant_fcfa, statut, date_emission, date_echeance) VALUES
    (1, 'FAC-202501-0001', '2025-01', 5000,  'payee',     '2025-01-05', '2025-01-20'),
    (1, 'FAC-202502-0002', '2025-02', 5000,  'payee',     '2025-02-05', '2025-02-20'),
    (2, 'FAC-202501-0003', '2025-01', 1000,  'impayee',   '2025-01-05', '2025-01-20'),
    (3, 'FAC-202502-0004', '2025-02', 10000, 'en_retard', '2025-02-05', '2025-02-20'),
    (4, 'FAC-202502-0005', '2025-02', 5000,  'impayee',   '2025-02-05', '2025-02-20')
ON CONFLICT DO NOTHING;

INSERT INTO tickets (client_id, agent_id, sujet, statut) VALUES
    (1, 2, 'Facture incorrecte — montant trop eleve', 'en_cours'),
    (3, 3, 'Probleme de connexion data',              'ouvert'),
    (2, NULL, 'Changement de forfait demande',         'ouvert')
ON CONFLICT DO NOTHING;

COMMIT;

-- Migration : harmoniser le statut initial des appels (en_attente → initie)
-- À exécuter si votre base a été créée avec l'ancien schéma (DEFAULT 'en_attente').
--
-- psql -U postgres -d senegal_connect -f docs/migrations/001_appels_statut_initie.sql

BEGIN;

UPDATE appels SET statut = 'initie' WHERE statut = 'en_attente';

ALTER TABLE appels DROP CONSTRAINT IF EXISTS appels_statut_check;
ALTER TABLE appels
  ALTER COLUMN statut SET DEFAULT 'initie',
  ADD CONSTRAINT appels_statut_check
    CHECK (statut IN ('initie', 'accepte', 'refuse', 'termine'));

COMMIT;

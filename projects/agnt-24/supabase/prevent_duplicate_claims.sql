-- agnt.24 — Защита от дублей: один и тот же krisha-объект нельзя взять
-- «В базу» дважды внутри одного агентства.
-- Выполнить в Supabase Dashboard → SQL Editor (после schema.sql/rls.sql/agency_hierarchy.sql/mop_transfers.sql).
--
-- Контекст: раньше клиент (app.js) вообще не проверял, не взял ли уже
-- коллега тот же krisha-объект — красная/зелёная лампочка и баннер
-- «занято коллегой» смотрели только на localStorage телефона (и на
-- синтетические демо-данные в архиве), поэтому два агента одного
-- агентства могли создать два properties-объекта на одно и то же
-- объявление krisha.kz. Частичный уникальный индекс — защита на
-- уровне БД (клиентская проверка в app.js — для UX, эта миграция —
-- чтобы дубль не прошёл даже при гонке двух одновременных claim).

DROP INDEX IF EXISTS uq_properties_agency_krisha;
CREATE UNIQUE INDEX uq_properties_agency_krisha
  ON properties (agency_id, source_krisha_id)
  WHERE source_krisha_id IS NOT NULL AND status <> 'archived';

COMMENT ON INDEX uq_properties_agency_krisha IS
  'Один krisha-объект — один активный/черновой property на агентство. Снятый с работы (archived) освобождает объект для повторного claim.';

-- agnt.24 — Защита от дублей: один и тот же покупатель не должен создавать
-- второй лид по тому же объекту при повторном раскрытии контакта.
-- Выполнить в Supabase Dashboard → SQL Editor (после schema.sql/rls.sql).
--
-- Контекст: buyer-feed.js._revealContact() вызывает Sb.createLead() каждый
-- раз, когда покупатель жмёт «Позвонить агенту» — включая повторные визиты
-- в ленту (BuyerFeed.show() каждый раз перерисовывает карточки заново,
-- «уже раскрыто» нигде не запоминается). Комментарий в buyer-feed.js
-- («лид уже существует — OK» на catch) предполагал, что INSERT упадёт на
-- дубле — но в leads не было НИКАКОГО уникального ограничения на
-- (property_id, buyer_id), поэтому каждый повторный клик тихо создавал
-- новую строку в leads: CRM засорялась дублями одного и того же лида,
-- «не звонили N дней» считало по каждому дублю отдельно.
--
-- Сначала схлопываем уже накопленные дубли (оставляем самый ранний лид —
-- на нём уже могли быть заметки/этап через localStorage привязанные к
-- его id, более новые дубли гарантированно пустые), затем закрываем
-- дыру уникальным индексом на уровне БД.

DELETE FROM leads a USING leads b
  WHERE a.buyer_id IS NOT NULL
    AND a.property_id = b.property_id
    AND a.buyer_id = b.buyer_id
    AND a.created_at > b.created_at;

DROP INDEX IF EXISTS uq_leads_property_buyer;
CREATE UNIQUE INDEX uq_leads_property_buyer
  ON leads (property_id, buyer_id)
  WHERE buyer_id IS NOT NULL;

COMMENT ON INDEX uq_leads_property_buyer IS
  'Один покупатель — один лид на объект, даже при повторном раскрытии контакта.';

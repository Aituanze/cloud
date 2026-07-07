// agnt.24 — send-push Edge Function
//
// Рассылает Web Push уведомление всем подпискам (браузер/устройство) одного
// профиля. Вызывается клиентом через Sb.triggerPush() (см.
// agnt-24-app/js/supabase-client.js) — сейчас единственная точка вызова:
// buyer-feed.js после Sb.createLead(), сразу как покупатель раскрыл контакт
// агента ("Новый лид").
//
// ── Деплой (владелец, вручную — CLI-доступ у агента отсутствует) ──────────
//   1. supabase functions deploy send-push
//   2. supabase secrets set VAPID_PUBLIC_KEY=<см. Push.VAPID_PUBLIC_KEY в push-notifications.js>
//      supabase secrets set VAPID_PRIVATE_KEY=<приватный ключ — выдан отдельно в чате, не в git>
//      supabase secrets set VAPID_SUBJECT=mailto:a.s.tileubaev@gmail.com
//   3. Убедиться, что push_subscriptions.sql уже накачен (иначе SELECT ниже упадёт).
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — доступны автоматически, их
// отдельно задавать не нужно (инжектятся Supabase в рантайм каждой функции).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const vapidSubject = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:support@agnt24.kz';

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!vapidPublic || !vapidPrivate) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), { status: 500 });
  }

  let payload: { profile_id?: string; title?: string; body?: string; url?: string; tag?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }

  const { profile_id, title, body, url, tag } = payload;
  if (!profile_id) {
    return new Response(JSON.stringify({ error: 'profile_id required' }), { status: 400 });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profile_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), { status: 200 });
  }

  const notificationPayload = JSON.stringify({
    title: title || 'agnt.24',
    body:  body  || '',
    url:   url   || './index.html',
    tag:   tag   || undefined,
  });

  let sent = 0;
  const staleIds: string[] = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notificationPayload,
      );
      sent++;
    } catch (e) {
      // 404/410 = браузер отозвал подписку (разлогин/переустановка) — чистим,
      // чтобы не долбить мёртвый endpoint при каждом следующем лиде.
      const status = e?.statusCode;
      if (status === 404 || status === 410) staleIds.push(sub.id);
    }
  }));

  if (staleIds.length > 0) {
    await db.from('push_subscriptions').delete().in('id', staleIds);
  }

  return new Response(JSON.stringify({ sent, removed: staleIds.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

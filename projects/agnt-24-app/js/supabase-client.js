// Supabase client + helpers
const { createClient } = supabase;
const _db = createClient(
  'https://fwjwzyoplzyfgrcpiyxb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3and6eW9wbHp5ZmdyY3BpeXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTg0NDMsImV4cCI6MjA5ODQ5NDQ0M30.jXQgONEduLv9NAqOn4Neofr0rFOl477X3CvAZR2oIJg'
);

const Sb = {
  auth: _db.auth,
  db:   _db,

  async getSession() {
    const { data: { session } } = await _db.auth.getSession();
    return session;
  },

  async getProfile(uid) {
    // Явно указываем FK (agencies!profiles_agency_id_fkey) — после того как в
    // agencies появилась вторая связь с profiles (created_by), связку
    // "agencies(*)" без уточнения PostgREST разрешить не может (ошибка,
    // будто профиль не найден вообще).
    const { data, error } = await _db
      .from('profiles')
      .select('*, agencies!profiles_agency_id_fkey(*)')
      .eq('id', uid)
      .single();
    if (error) console.error('getProfile', error);
    return data;
  },

  async getBuyerProfile(uid) {
    const { data } = await _db
      .from('buyer_profiles')
      .select('*')
      .eq('id', uid)
      .single();
    return data;
  },

  async getPublishedProperties(limit = 100) {
    const { data } = await _db
      .from('properties')
      .select('id,type,district,address,price,price_label,area,rooms,floor,floors,building_type,photos,description,published_at,agent_id')
      .eq('status', 'active')
      .order('published_at', { ascending: false })
      .limit(limit);
    return data || [];
  },

  // Какие krisha-объявления уже взяты «В базу» кем-либо в агентстве — чтобы
  // показать реальную (не только локальную) красную/зелёную лампочку и не
  // дать второму агенту задублировать объект коллеги.
  async getAgencyClaimedKrishaIds(agencyId) {
    const { data } = await _db
      .from('properties')
      .select('source_krisha_id, agent_id, profiles(name)')
      .eq('agency_id', agencyId)
      .not('source_krisha_id', 'is', null)
      .neq('status', 'archived');
    return data || [];
  },

  async getAgentProperties(agentId) {
    const { data } = await _db
      .from('properties')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });
    return data || [];
  },

  async upsertProperty(obj) {
    const { data, error } = await _db
      .from('properties')
      .upsert(obj)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async uploadPhoto(file, propertyId) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${propertyId}/${Date.now()}.${ext}`;

    // Сжать через Canvas перед загрузкой
    const compressed = await this._compressImage(file, 1200, 0.82);

    const { error } = await _db.storage
      .from('property-photos')
      .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;

    const { data: { publicUrl } } = _db.storage
      .from('property-photos')
      .getPublicUrl(path);
    return publicUrl;
  },

  _compressImage(file, maxDim, quality) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = url;
    });
  },

  async createLead(propertyId, agentId, buyerId, buyerPhone) {
    const { data, error } = await _db
      .from('leads')
      .insert({ property_id: propertyId, agent_id: agentId, buyer_id: buyerId || null, buyer_phone: buyerPhone, stage: 'new' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getAgentLeads(agentId) {
    const { data } = await _db
      .from('leads')
      .select('*, properties(address,price_label,photos), buyer_profiles(phone,name)')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });
    return data || [];
  },

  async getAgencyAgents(agencyId, excludeId) {
    const { data } = await _db
      .from('profiles')
      .select('id, name, role')
      .eq('agency_id', agencyId)
      .neq('id', excludeId);
    return data || [];
  },

  async requestTransfer(propertyId, fromAgentId, toAgentId, note) {
    const { data, error } = await _db
      .from('transfer_requests')
      .insert({ property_id: propertyId, from_agent_id: fromAgentId, to_agent_id: toAgentId, requested_by: fromAgentId, note: note || null })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getPendingTransfers() {
    const { data } = await _db
      .from('transfer_requests')
      .select('*, properties(address, price_label), from:profiles!transfer_requests_from_agent_id_fkey(name), to:profiles!transfer_requests_to_agent_id_fkey(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    return data || [];
  },

  async decideTransfer(requestId, approve) {
    const { error } = await _db.rpc('approve_transfer', { request_id: requestId, approve });
    if (error) throw error;
  },

  // ── Иерархия агентств / приглашения ────────────────────────────────

  async getInviteByToken(token) {
    const { data, error } = await _db.rpc('get_invite_by_token', { p_token: token }).single();
    if (error) throw error;
    return data;
  },

  async acceptInvite(token, name, phone) {
    const { error } = await _db.rpc('accept_invite', { p_token: token, p_name: name, p_phone: phone });
    if (error) throw error;
  },

  async createAgency(name, subscriptionStatus, directorEmail, directorName) {
    const { data, error } = await _db.rpc('create_agency', {
      p_name: name, p_subscription: subscriptionStatus,
      p_director_email: directorEmail, p_director_name: directorName,
    });
    if (error) throw error;
    return data;
  },

  async getAllAgencies() {
    const { data } = await _db.from('agencies').select('*').order('created_at', { ascending: false });
    return data || [];
  },

  async deleteAgency(agencyId) {
    const { error } = await _db.from('agencies').delete().eq('id', agencyId);
    if (error) throw error;
  },

  async getAllProfiles() {
    // Для superadmin — вся иерархия сразу, дальше группируем на клиенте
    const { data } = await _db.from('profiles').select('id, agency_id, role, mop_id, name, hired_at, deposits_manual, volume_manual');
    return data || [];
  },

  async createInvite(agencyId, email, role, invitedBy) {
    const { data, error } = await _db
      .from('invites')
      .insert({ agency_id: agencyId, email, role, invited_by: invitedBy })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getAgencyInvites(agencyId) {
    const { data } = await _db
      .from('invites')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });
    return data || [];
  },

  async getAgencyProfiles(agencyId) {
    const { data } = await _db
      .from('profiles')
      .select('id, role, mop_id, name, hired_at, deposits_manual, volume_manual')
      .eq('agency_id', agencyId);
    return data || [];
  },

  async getAgencyProperties(agencyId) {
    const { data } = await _db
      .from('properties')
      .select('id, type, exclusivity, status, created_at')
      .eq('agency_id', agencyId);
    return data || [];
  },

  async updateAgentStats(agentId, { hired_at, deposits_manual, volume_manual }) {
    const { error } = await _db
      .from('profiles')
      .update({ hired_at, deposits_manual, volume_manual })
      .eq('id', agentId);
    if (error) throw error;
  },

  async updateLeadStage(leadId, stageTo, note) {
    const { data: lead } = await _db.from('leads').select('stage').eq('id', leadId).single();
    const { error: updErr } = await _db.from('leads')
      .update({ stage: stageTo, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (updErr) throw updErr;
    const { error: evErr } = await _db.from('lead_events').insert({
      lead_id:    leadId,
      stage_from: lead?.stage || null,
      stage_to:   stageTo,
      note:       note || null,
    });
    if (evErr) throw evErr;
  },

  // ── Push-уведомления (Web Push) ─────────────────────────────────────

  async savePushSubscription(profileId, { endpoint, p256dh, auth }) {
    const { error } = await _db
      .from('push_subscriptions')
      .upsert({ profile_id: profileId, endpoint, p256dh, auth }, { onConflict: 'endpoint' });
    if (error) throw error;
  },

  async removePushSubscription(endpoint) {
    const { error } = await _db.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) throw error;
  },

  // Просит Edge Function send-push разослать уведомление агенту. Best-effort:
  // функция может быть ещё не задеплоена — вызывающий код не должен падать
  // из-за этого (см. buyer-feed.js._revealContact).
  async triggerPush(profileId, { title, body, url, tag }) {
    const { error } = await _db.functions.invoke('send-push', {
      body: { profile_id: profileId, title, body, url, tag },
    });
    if (error) throw error;
  },
};

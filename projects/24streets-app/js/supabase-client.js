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
    const { data } = await _db
      .from('profiles')
      .select('*, agencies(*)')
      .eq('id', uid)
      .single();
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

  async updateLeadStage(leadId, stageTo, note) {
    const { data: lead } = await _db.from('leads').select('stage').eq('id', leadId).single();
    await _db.from('leads')
      .update({ stage: stageTo, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    await _db.from('lead_events').insert({
      lead_id:    leadId,
      stage_from: lead?.stage || null,
      stage_to:   stageTo,
      note:       note || null,
    });
  },
};

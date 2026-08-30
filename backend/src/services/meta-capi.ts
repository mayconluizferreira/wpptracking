import { db } from '../db/index';
import { leads } from '../db/schema';
import type { Lead } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getSettings } from './settings-cache';
import { hashPhone, hashName, splitName } from './hash';

const CAPI_BASE = 'https://graph.facebook.com/v22.0';

interface CapiUserData {
  ph?: string;
  fn?: string;
  ln?: string;
  ctwa_clid?: string;
  whatsapp_business_account_id?: string;
  page_id?: string;
}

interface CapiEvent {
  action_source: string;
  event_name: string;
  event_time: number;
  messaging_channel: string;
  user_data: CapiUserData;
}

async function sendCapiEvent(
  pixelId: string,
  accessToken: string,
  event: CapiEvent
): Promise<boolean> {
  try {
    const res = await fetch(
      `${CAPI_BASE}/${pixelId}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event] }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('[meta-capi] sendCapiEvent error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[meta-capi] sendCapiEvent exception:', err);
    return false;
  }
}

function buildUserData(lead: Lead, wabaId?: string | null, pageId?: string | null): CapiUserData {
  const userData: CapiUserData = {
    ph: hashPhone(lead.telefone),
  };

  if (lead.nome) {
    const { firstName, lastName } = splitName(lead.nome);
    if (firstName) userData.fn = hashName(firstName);
    if (lastName) userData.ln = hashName(lastName);
  }

  if (lead.ctwaclid) userData.ctwa_clid = lead.ctwaclid;
  // WABA ID is required for business_messaging CTWA events (error 2804116 without it)
  if (wabaId) userData.whatsapp_business_account_id = wabaId;
  // page_id is required for business_messaging events (error_subcode 2804069 without it)
  if (pageId) userData.page_id = pageId;

  return userData;
}

// 'sent' = API called and succeeded
// 'failed' = API called but returned error (increment retry count)
// 'skipped' = not attempted (missing ctwaclid or settings not configured yet)
export type CapiResult = 'sent' | 'failed' | 'skipped';

export async function sendLeadSubmitted(lead: Lead, tenantId: number): Promise<CapiResult> {
  if (lead.lead_submitted_sent) return 'sent';
  if (!lead.ctwaclid) return 'skipped';

  const cfg = await getSettings(tenantId);
  if (!cfg?.meta_pixel_id || !cfg?.meta_access_token) {
    console.log(`[meta-capi] LeadSubmitted skipped for lead ${lead.id}: settings not configured`);
    return 'skipped';
  }

  const event: CapiEvent = {
    action_source: 'business_messaging',
    event_name: 'LeadSubmitted',
    event_time: Math.floor(Date.now() / 1000),
    messaging_channel: 'whatsapp',
    user_data: buildUserData(lead, cfg.meta_waba_id, cfg.meta_page_id),
  };

  const ok = await sendCapiEvent(cfg.meta_pixel_id, cfg.meta_access_token, event);
  if (ok) {
    await db
      .update(leads)
      .set({ lead_submitted_sent: true })
      .where(eq(leads.id, lead.id));
    console.log(`[meta-capi] LeadSubmitted sent for lead ${lead.id}`);
    return 'sent';
  }
  return 'failed';
}

export async function sendQualifiedLead(lead: Lead, tenantId: number): Promise<CapiResult> {
  if (lead.qualified_lead_sent) return 'sent';
  if (!lead.ctwaclid) return 'skipped';

  const cfg = await getSettings(tenantId);
  if (!cfg?.meta_pixel_id || !cfg?.meta_access_token) {
    return 'skipped';
  }

  const event: CapiEvent = {
    action_source: 'business_messaging',
    event_name: 'QualifiedLead',
    event_time: Math.floor(Date.now() / 1000),
    messaging_channel: 'whatsapp',
    user_data: buildUserData(lead, cfg.meta_waba_id, cfg.meta_page_id),
  };

  const ok = await sendCapiEvent(cfg.meta_pixel_id, cfg.meta_access_token, event);
  if (ok) {
    await db
      .update(leads)
      .set({ qualified_lead_sent: true })
      .where(eq(leads.id, lead.id));
    console.log(`[meta-capi] QualifiedLead sent for lead ${lead.id}`);
    return 'sent';
  }
  return 'failed';
}

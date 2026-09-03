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
  messaging_channel?: string;
  user_data: CapiUserData;
  custom_data?: { value: number; currency: string };
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

// Builds user_data for a phone-based conversion event. Doesn't require
// ctwa_clid/page_id/waba_id — Meta matches the hashed phone against its own
// identity graph (WhatsApp/Instagram/Facebook) to feed general ad account
// optimization, instead of attributing to one specific ad click. Confirmed
// working against the live CAPI endpoint with action_source "other".
// If a ctwa_clid IS available (a real ad click was captured), we still send
// it — it can only make the match more precise, never hurts.
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
  if (wabaId) userData.whatsapp_business_account_id = wabaId;
  if (pageId) userData.page_id = pageId;

  return userData;
}

// 'sent' = API called and succeeded
// 'failed' = API called but returned error (increment retry count)
// 'skipped' = not attempted (settings not configured yet)
export type CapiResult = 'sent' | 'failed' | 'skipped';

export async function sendLeadSubmitted(lead: Lead, tenantId: number): Promise<CapiResult> {
  if (lead.lead_submitted_sent) return 'sent';

  const cfg = await getSettings(tenantId);
  if (!cfg?.meta_pixel_id || !cfg?.meta_access_token) {
    console.log(`[meta-capi] LeadSubmitted skipped for lead ${lead.id}: settings not configured`);
    return 'skipped';
  }

  const event: CapiEvent = {
    action_source: 'other',
    event_name: 'LeadSubmitted',
    event_time: Math.floor(Date.now() / 1000),
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

  const cfg = await getSettings(tenantId);
  if (!cfg?.meta_pixel_id || !cfg?.meta_access_token) {
    return 'skipped';
  }

  const event: CapiEvent = {
    action_source: 'other',
    event_name: 'QualifiedLead',
    event_time: Math.floor(Date.now() / 1000),
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

// Fires when a lead's status becomes 'ganho' with a sale value attached.
// Distinct from QualifiedLead: this is what lets Meta's delivery algorithm
// learn from actual revenue (value-based optimization / lookalikes), not
// just from who qualified.
export async function sendPurchase(lead: Lead, tenantId: number): Promise<CapiResult> {
  if (lead.purchase_sent) return 'sent';
  if (lead.valor == null) return 'skipped';

  const cfg = await getSettings(tenantId);
  if (!cfg?.meta_pixel_id || !cfg?.meta_access_token) {
    return 'skipped';
  }

  const value = parseFloat(lead.valor);
  if (isNaN(value) || value <= 0) return 'skipped';

  const event: CapiEvent = {
    action_source: 'other',
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    user_data: buildUserData(lead, cfg.meta_waba_id, cfg.meta_page_id),
    custom_data: { value, currency: lead.moeda ?? 'BRL' },
  };

  const ok = await sendCapiEvent(cfg.meta_pixel_id, cfg.meta_access_token, event);
  if (ok) {
    await db
      .update(leads)
      .set({ purchase_sent: true })
      .where(eq(leads.id, lead.id));
    console.log(`[meta-capi] Purchase sent for lead ${lead.id} (value: ${value} ${lead.moeda ?? 'BRL'})`);
    return 'sent';
  }
  return 'failed';
}

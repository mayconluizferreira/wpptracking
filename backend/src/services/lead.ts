import { db } from '../db/index';
import { leads, messages, webhook_logs } from '../db/schema';
import type { Lead, LeadStatus, NewLead } from '../db/schema';
import { eq, and, gte, lt, desc } from 'drizzle-orm';
import type { ParsedMessage } from '../types/parsed-message';
import { normalizePhone } from './hash';
import { fetchAdData } from './meta-graph';
import { sendLeadSubmitted, sendQualifiedLead, sendPurchase } from './meta-capi';
import { extractPaymentValue } from './openai-vision';
import { getSettings } from './settings-cache';
import { getTriggerPhrases } from './trigger-cache';

async function logWebhook(
  tenantId: number,
  source: 'whatsapp_cloud' | 'evolution' | 'cloudia',
  payload: unknown,
  processed: boolean,
  error: string | null
): Promise<void> {
  try {
    await db.insert(webhook_logs).values({
      tenant_id: tenantId,
      source,
      payload: payload as Record<string, unknown>,
      processed,
      error,
    });
  } catch (err) {
    console.error('[lead] logWebhook error:', err);
  }
}

async function storeMessage(leadId: number, parsed: ParsedMessage): Promise<void> {
  await db.insert(messages).values({
    lead_id: leadId,
    direcao: parsed.direction,
    conteudo: parsed.content,
    tipo: parsed.tipo,
    message_id_whatsapp: parsed.messageId,
    timestamp_whatsapp: parsed.timestamp ? new Date(parsed.timestamp) : new Date(),
    veio_de_anuncio: parsed.veioDeAnuncio,
  });
}

export async function processIncomingMessage(
  parsed: ParsedMessage,
  tenantId: number,
  connectionOverride?: { meta_access_token?: string | null; meta_ad_account_id?: string | null }
): Promise<void> {
  // Reject messages not from today in Brazil timezone (UTC-3).
  // Prevents Meta webhook replays from previous days creating stale leads.
  const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000;
  const msgTime = new Date(parsed.timestamp).getTime();
  if (isNaN(msgTime)) {
    console.log(`[lead] Skipping message with invalid timestamp from ${parsed.phone}`);
    return;
  }
  const toBrazilDay = (ts: number) => new Date(ts + BRAZIL_OFFSET_MS).toISOString().slice(0, 10);
  const todayBrazil = toBrazilDay(Date.now());
  const msgDayBrazil = toBrazilDay(msgTime);
  if (msgDayBrazil !== todayBrazil) {
    console.log(`[lead] Skipping message from ${msgDayBrazil} (today is ${todayBrazil}, phone: ${parsed.phone})`);
    return;
  }

  // Early path for outgoing messages: only detect trigger phrases, no lead creation
  if (parsed.direction === 'saida') {
    try {
      // parsed.phone already comes normalized from the parser (from the
      // WhatsApp JID, which always carries the full country code) — do not
      // re-run normalizePhone() here, it would incorrectly rewrite non-BR
      // numbers (see normalizePhoneFromJid for why).
      const phone = parsed.phone;
      const lead = await db.query.leads.findFirst({
        where: and(eq(leads.telefone, phone), eq(leads.tenant_id, tenantId)),
        orderBy: [desc(leads.data_entrada)],
      });
      if (lead) {
        await storeMessage(lead.id, parsed);
        const phrases = await getTriggerPhrases(tenantId);
        const content = (parsed.content ?? '').toLowerCase();
        const matched = phrases.find((p) => content.includes(p.phrase.toLowerCase()));
        if (matched && matched.status !== lead.status) {
          await updateLeadStatus(lead.id, matched.status);
        }
      }
    } catch (err) {
      console.error('[lead] processOutgoingMessage error:', err);
    }
    return;
  }

  // 1. Log webhook
  await logWebhook(tenantId, parsed.source, parsed.rawPayload, false, null);

  try {
    // Same as above — parsed.phone is already normalized, don't re-run normalizePhone().
    const phone = parsed.phone;
    const cfg = await getSettings(tenantId);

    // 2. Find or create lead — only match leads from the same calendar day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    let existing = await db.query.leads.findFirst({
      where: and(
        eq(leads.telefone, phone),
        eq(leads.tenant_id, tenantId),
        gte(leads.data_entrada, todayStart),
        lt(leads.data_entrada, tomorrowStart),
      ),
    });

    let isNew = false;

    if (!existing) {
      // Create a lead for every incoming conversation — with ad data when
      // available (ctwaclid present), marked 'organico' otherwise. This lets
      // the CRM track real conversations even when ad attribution isn't
      // available (e.g. Evolution API not surfacing ctwa referral data).
      isNew = true;
      const newLead: NewLead = {
        tenant_id: tenantId,
        nome: parsed.name,
        telefone: phone,
        mensagem_inicial: parsed.content,
        link_whatsapp: `https://wa.me/${phone}`,
        origem: parsed.veioDeAnuncio ? 'anuncio' : 'organico',
        status: 'novo',
        data_entrada: new Date(),
        ctwaclid: parsed.ctwaclid,
        source_id: parsed.sourceId,
        titulo_anuncio: parsed.tituloAnuncio,
        tipo_midia: parsed.tipoMidia,
        thumbnail_url: parsed.thumbnailUrl,
        url_anuncio: parsed.sourceUrl,
      };

      const [inserted] = await db.insert(leads).values(newLead).returning();
      existing = inserted;
    } else {
      // Existing lead — check attribution model
      const model = cfg?.attribution_model ?? 'ultimo_clique';
      if (model === 'ultimo_clique' && parsed.veioDeAnuncio) {
        await db
          .update(leads)
          .set({
            ctwaclid: parsed.ctwaclid,
            source_id: parsed.sourceId,
            titulo_anuncio: parsed.tituloAnuncio,
            tipo_midia: parsed.tipoMidia,
            thumbnail_url: parsed.thumbnailUrl,
            url_anuncio: parsed.sourceUrl,
            origem: 'anuncio',
            updated_at: new Date(),
          })
          .where(eq(leads.id, existing.id));
        existing = (await db.query.leads.findFirst({ where: eq(leads.id, existing.id) })) ?? existing;
      }
    }

    // 3. Store message
    await storeMessage(existing.id, parsed);

    // 4. Fetch ad data from Graph API if new lead with ad data
    const accessToken = connectionOverride?.meta_access_token ?? cfg?.meta_access_token;
    const adAccountId = connectionOverride?.meta_ad_account_id ?? cfg?.meta_ad_account_id;
    // Fetch ad data for any lead missing campaign info that has a sourceId
    if (parsed.sourceId && accessToken && !existing.campanha) {
      console.log(`[lead] fetching ad-data — phone:${parsed.phone} sourceId:${parsed.sourceId} isNew:${isNew}`);
      const adData = await fetchAdData(parsed.sourceId, accessToken, adAccountId);
      console.log(`[lead] fetchAdData result:`, adData ? `campanha="${adData.campaignName}"` : 'null');
      if (adData) {
        await db
          .update(leads)
          .set({
            anuncio: adData.adName,
            conjunto_anuncio: adData.adsetName,
            campanha: adData.campaignName,
          })
          .where(eq(leads.id, existing.id));
        existing = { ...existing, anuncio: adData.adName, conjunto_anuncio: adData.adsetName, campanha: adData.campaignName };
      }
    }

    // 5. Send LeadSubmitted CAPI event for new leads
    if (isNew) {
      await sendLeadSubmitted(existing, tenantId).catch((err) =>
        console.error('[lead] sendLeadSubmitted error:', err)
      );
    }

    // 6. Auto-detect payment receipt images (Pix, etc) and mark as 'ganho'
    // when the value can be read with high confidence. Never auto-marks on
    // low confidence or ambiguous reads — falls back to manual confirmation.
    if (parsed.tipo === 'imagem' && parsed.imageBase64 && process.env.OPENAI_API_KEY) {
      try {
        const extraction = await extractPaymentValue(parsed.imageBase64, process.env.OPENAI_API_KEY);
        console.log(`[lead] receipt extraction for lead ${existing.id}:`, extraction);
        if (
          extraction?.isPaymentReceipt &&
          extraction.confidence === 'high' &&
          extraction.value != null &&
          extraction.value > 0 &&
          existing.status !== 'ganho'
        ) {
          await updateLeadStatus(existing.id, 'ganho', {
            valor: extraction.value,
            moeda: extraction.currency,
          });
          console.log(`[lead] auto-marked lead ${existing.id} as ganho (R$ ${extraction.value}) from receipt image`);
        }
      } catch (err) {
        console.error('[lead] receipt extraction error:', err);
      }
    }

    // Mark webhook as processed
    await db
      .update(webhook_logs)
      .set({ processed: true })
      .where(
        and(
          eq(webhook_logs.tenant_id, tenantId),
          eq(webhook_logs.source, parsed.source),
          eq(webhook_logs.processed, false)
        )
      );
  } catch (err) {
    console.error('[lead] processIncomingMessage error:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logWebhook(tenantId, parsed.source, parsed.rawPayload, false, errorMsg);
  }
}

export async function updateLeadStatus(
  id: number,
  status: LeadStatus,
  sale?: { valor: number; moeda?: string }
): Promise<Lead | null> {
  const updates: Partial<Lead & { updated_at: Date }> = {
    status,
    updated_at: new Date(),
  };

  if (status === 'qualificado') updates.data_qualificacao = new Date();
  if (status === 'ganho') {
    updates.data_ganho = new Date();
    if (sale?.valor != null) {
      updates.valor = sale.valor.toString();
      updates.moeda = sale.moeda ?? 'BRL';
    }
  }

  const [updated] = await db.update(leads).set(updates).where(eq(leads.id, id)).returning();

  if (!updated) return null;

  // Fire QualifiedLead CAPI for qualificado or ganho
  if ((status === 'qualificado' || status === 'ganho') && !updated.qualified_lead_sent && updated.tenant_id) {
    sendQualifiedLead(updated, updated.tenant_id).catch((err) =>
      console.error('[lead] sendQualifiedLead error:', err)
    );
  }

  // Fire Purchase CAPI when a sale value was attached
  if (status === 'ganho' && !updated.purchase_sent && updated.tenant_id) {
    sendPurchase(updated, updated.tenant_id).catch((err) =>
      console.error('[lead] sendPurchase error:', err)
    );
  }

  return updated;
}

export async function findLeadByPhone(phone: string, tenantId: number): Promise<Lead | null> {
  const normalized = normalizePhone(phone);
  return (
    (await db.query.leads.findFirst({
      where: and(eq(leads.telefone, normalized), eq(leads.tenant_id, tenantId)),
    })) ?? null
  );
}

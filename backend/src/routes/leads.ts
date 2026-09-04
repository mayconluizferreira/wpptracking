import { Router } from 'express';
import { db } from '../db/index';
import { leads, messages, connections } from '../db/schema';
import type { LeadStatus } from '../db/schema';
import { eq, and, or, ilike, gte, lte, desc, count, isNull, isNotNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { updateLeadStatus } from '../services/lead';
import { fetchAdData } from '../services/meta-graph';
import { getSettings } from '../services/settings-cache';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

// GET /api/leads
router.get('/', async (req, res, next) => {
  try {
    const { tenantId } = (req as unknown as AuthRequest).user;
    const { status, origem, search, campanha, date_from, date_to, pais } = req.query as Record<string, string>;
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 100);
    const offset = (page - 1) * limit;

    const conditions = [eq(leads.tenant_id, tenantId)];

    if (status) conditions.push(eq(leads.status, status as LeadStatus));
    if (origem) conditions.push(eq(leads.origem, origem as 'anuncio' | 'organico'));
    if (campanha) conditions.push(ilike(leads.campanha, `%${campanha}%`));
    // País derivado do DDI no início do telefone (55 = Brasil, 1 = EUA/Canadá)
    if (pais === 'BR') conditions.push(ilike(leads.telefone, '55%'));
    if (pais === 'US') conditions.push(ilike(leads.telefone, '1%'));
    if (date_from) conditions.push(gte(leads.data_entrada, new Date(date_from)));
    if (date_to) conditions.push(lte(leads.data_entrada, new Date(date_to)));
    if (search) {
      const searchOr = or(ilike(leads.nome, `%${search}%`), ilike(leads.telefone, `%${search}%`));
      if (searchOr) conditions.push(searchOr);
    }

    const where = and(...conditions)!;

    const [rows, totalResult] = await Promise.all([
      db.query.leads.findMany({
        where,
        orderBy: [desc(leads.data_entrada)],
        limit,
        offset,
      }),
      db.select({ count: count() }).from(leads).where(where),
    ]);

    const leadsWithLastMsg = await Promise.all(
      rows.map(async (lead) => {
        const lastMsg = await db.query.messages.findFirst({
          where: eq(messages.lead_id, lead.id),
          orderBy: [desc(messages.created_at)],
        });
        return { ...lead, ultima_mensagem: lastMsg?.conteudo ?? null };
      })
    );

    res.json({
      leads: leadsWithLastMsg,
      total: totalResult[0]?.count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { tenantId } = (req as unknown as AuthRequest).user;
    const id = parseInt(req.params.id, 10);
    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), eq(leads.tenant_id, tenantId)),
    });

    if (!lead) {
      res.status(404).json({ error: 'Lead não encontrado' });
      return;
    }

    const msgCount = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.lead_id, id));

    res.json({ ...lead, message_count: msgCount[0]?.count ?? 0 });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id
const updateSchema = z.object({
  status: z.enum(['novo', 'em_atendimento', 'qualificado', 'ganho', 'perdido']).optional(),
  nome: z.string().optional(),
  campanha: z.string().nullable().optional(),
  conjunto_anuncio: z.string().nullable().optional(),
  anuncio: z.string().nullable().optional(),
  valor: z.number().positive().optional(),
  moeda: z.string().optional(),
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { tenantId } = (req as unknown as AuthRequest).user;
    const id = parseInt(req.params.id, 10);
    const result = updateSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ error: 'Dados inválidos', details: result.error.issues });
      return;
    }

    // Verify ownership
    const existing = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), eq(leads.tenant_id, tenantId)),
    });
    if (!existing) {
      res.status(404).json({ error: 'Lead não encontrado' });
      return;
    }

    const { status, nome, campanha, conjunto_anuncio, anuncio, valor, moeda } = result.data;
    let lead;

    if (status) {
      lead = await updateLeadStatus(id, status, valor != null ? { valor, moeda } : undefined);
    }

    const directUpdate: Record<string, unknown> = { updated_at: new Date() };
    if (nome !== undefined) directUpdate.nome = nome;
    if (campanha !== undefined) directUpdate.campanha = campanha;
    if (conjunto_anuncio !== undefined) directUpdate.conjunto_anuncio = conjunto_anuncio;
    if (anuncio !== undefined) directUpdate.anuncio = anuncio;

    if (Object.keys(directUpdate).length > 1) {
      const [updated] = await db
        .update(leads)
        .set(directUpdate)
        .where(eq(leads.id, id))
        .returning();
      lead = updated;
    }

    if (!lead) {
      res.status(404).json({ error: 'Lead não encontrado' });
      return;
    }

    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id/messages
router.get('/:id/messages', async (req, res, next) => {
  try {
    const { tenantId } = (req as unknown as AuthRequest).user;
    const id = parseInt(req.params.id, 10);
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 100);
    const offset = (page - 1) * limit;

    // Verify ownership
    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), eq(leads.tenant_id, tenantId)),
    });
    if (!lead) {
      res.status(404).json({ error: 'Lead não encontrado' });
      return;
    }

    const [rows, totalResult] = await Promise.all([
      db.query.messages.findMany({
        where: eq(messages.lead_id, id),
        orderBy: [desc(messages.timestamp_whatsapp)],
        limit,
        offset,
      }),
      db.select({ count: count() }).from(messages).where(eq(messages.lead_id, id)),
    ]);

    res.json({
      messages: rows,
      total: totalResult[0]?.count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/backfill-ad-data — fetch ad data for leads missing campaign info
router.post('/backfill-ad-data', async (req, res, next) => {
  try {
    const { tenantId } = (req as unknown as AuthRequest).user;

    // Use global settings token (confirmed working) falling back to connection token
    const cfg = await getSettings(tenantId);
    const conn = await db.query.connections.findFirst({
      where: and(eq(connections.tenant_id, tenantId), isNotNull(connections.meta_access_token)),
    });

    const accessToken = cfg?.meta_access_token ?? conn?.meta_access_token ?? null;
    const adAccountId = cfg?.meta_ad_account_id ?? conn?.meta_ad_account_id ?? null;

    if (!accessToken) {
      res.status(400).json({ error: 'Nenhum Access Token configurado em Configurações → Meta Ads / CAPI.' });
      return;
    }

    // Get leads with source_id but no campaign
    const pending = await db.query.leads.findMany({
      where: and(eq(leads.tenant_id, tenantId), isNotNull(leads.source_id), isNull(leads.campanha)),
    });

    let updated = 0;
    for (const lead of pending) {
      if (!lead.source_id) continue;
      const adData = await fetchAdData(lead.source_id, accessToken, adAccountId);
      if (adData) {
        await db.update(leads).set({
          anuncio: adData.adName,
          conjunto_anuncio: adData.adsetName,
          campanha: adData.campaignName,
        }).where(eq(leads.id, lead.id));
        updated++;
      }
    }

    res.json({ total: pending.length, updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/reset-capi-retry — unblock leads stuck at capi_retry_count >= 3
// Resets retry count so the scheduler will try to send CAPI events again
router.post('/reset-capi-retry', async (req, res, next) => {
  try {
    const { tenantId } = (req as unknown as AuthRequest).user;
    const result = await db
      .update(leads)
      .set({ capi_retry_count: 0 })
      .where(
        and(
          eq(leads.tenant_id, tenantId),
          isNotNull(leads.ctwaclid),
          eq(leads.lead_submitted_sent, false)
        )
      );
    res.json({ ok: true, message: 'capi_retry_count resetado para leads não enviados com ctwaclid.' });
  } catch (err) {
    next(err);
  }
});

export { router as leadsRouter };

import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db/index';
import { connections, webhook_logs, settings, leads } from '../db/schema';
import { eq } from 'drizzle-orm';
import { parseWhatsAppCloud } from '../parsers/whatsapp-cloud';
import { parseEvolution } from '../parsers/evolution';
import { parseCloudia } from '../parsers/cloudia';
import { processIncomingMessage, updateLeadStatus, findLeadByPhone } from '../services/lead';

const router = Router();

// ─── Helper: resolve connection by ID ────────────────────────────────────────

async function getConnection(connectionId: number) {
  return db.query.connections.findFirst({ where: eq(connections.id, connectionId) });
}

// ─── WhatsApp Cloud webhook (per-connection) ──────────────────────────────────
// URL: /webhook/whatsapp/:connectionId
//   - with no connectionId: legacy single-tenant (reads first connection or env)

router.get('/whatsapp/:connectionId?', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe') {
    res.status(400).send('Bad Request');
    return;
  }

  let verifyToken: string | null = null;

  const connIdParam = (req.params as Record<string, string | undefined>)['connectionId'];
  if (connIdParam) {
    const connId = parseInt(connIdParam, 10);
    const conn = await getConnection(connId);
    verifyToken = conn?.verify_token ?? null;
  } else {
    // Legacy fallback: use env var
    verifyToken = process.env.VERIFY_TOKEN ?? null;
  }

  if (!verifyToken || token !== verifyToken) {
    res.status(403).send('Forbidden');
    return;
  }

  res.status(200).send(challenge);
});

router.post('/whatsapp/:connectionId?', async (req, res) => {
  try {
    const rawBody = req.body as Buffer;
    const connIdParam = (req.params as Record<string, string | undefined>)['connectionId'];

    let tenantId: number | null = null;
    let appSecret: string | null = null;
    let connCredentials: { meta_access_token?: string | null; meta_ad_account_id?: string | null } | undefined;

    if (connIdParam) {
      const connId = parseInt(connIdParam, 10);
      const conn = await getConnection(connId);
      if (conn) {
        tenantId = conn.tenant_id ?? null;
        appSecret = conn.app_secret ?? null;
        connCredentials = { meta_access_token: conn.meta_access_token, meta_ad_account_id: conn.meta_ad_account_id };
      }
    } else {
      // Legacy fallback: env APP_SECRET
      appSecret = process.env.APP_SECRET ?? null;
    }

    // Validate HMAC signature if secret configured
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (appSecret && signature) {
      const expected = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

      if (
        signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      ) {
        res.status(401).send('Invalid signature');
        return;
      }
    }

    const payload = JSON.parse(rawBody.toString());
    const parsed = parseWhatsAppCloud(payload);

    if (parsed && tenantId !== null) {
      setImmediate(() => processIncomingMessage(parsed, tenantId!, connCredentials));
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[webhook/whatsapp] error:', err);
    res.status(200).json({ status: 'ok' });
  }
});

// ─── Evolution webhook ────────────────────────────────────────────────────────
// URL: /webhook/evolution/:connectionId
// Configure this exact URL (with the connection's numeric ID) as the webhook
// URL on the Evolution API instance, so each instance routes to the right tenant.

router.post('/evolution/:connectionId?', async (req, res) => {
  try {
    const connIdParam = (req.params as Record<string, string | undefined>)['connectionId'];

    let tenantId: number | null = null;
    let apiKey: string | null = null;
    let connCredentials: { meta_access_token?: string | null; meta_ad_account_id?: string | null } | undefined;

    if (connIdParam) {
      const connId = parseInt(connIdParam, 10);
      const conn = await getConnection(connId);
      if (conn) {
        tenantId = conn.tenant_id ?? null;
        apiKey = conn.evolution_api_key ?? null;
        connCredentials = { meta_access_token: conn.meta_access_token, meta_ad_account_id: conn.meta_ad_account_id };
      }
    }

    if (!connIdParam) {
      console.warn('[webhook/evolution] received without connectionId — cannot route to a tenant. Configure the webhook URL as /webhook/evolution/:connectionId');
      res.status(200).json({ status: 'ok' });
      return;
    }

    if (tenantId === null) {
      console.warn(`[webhook/evolution] connection ${connIdParam} not found or has no tenant`);
      res.status(200).json({ status: 'ok' });
      return;
    }

    // Validate shared secret if the connection has evolution_api_key configured.
    // Set the same value as a custom header (e.g. "apikey") on the Evolution instance's webhook config.
    if (apiKey) {
      const provided = (req.headers['apikey'] as string | undefined) ?? (req.query['apikey'] as string | undefined);
      if (provided !== apiKey) {
        res.status(401).json({ status: 'unauthorized' });
        return;
      }
    }

    const parsed = parseEvolution(req.body);
    if (parsed) {
      setImmediate(() => processIncomingMessage(parsed, tenantId!, connCredentials));
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[webhook/evolution] error:', err);
    res.status(200).json({ status: 'ok' });
  }
});

// ─── Cloudia webhook (/webhook/cloudia/:tenantId) ─────────────────────────────
// Cloudia sends events when a contact is updated, appointment scheduled, or won.
// We match by phone, then update the existing lead status/name.

router.post('/cloudia/:tenantId', async (req, res) => {
  try {
    const tenantId = parseInt((req.params as Record<string, string>)['tenantId'], 10);
    if (isNaN(tenantId)) {
      res.status(400).json({ error: 'Invalid tenantId' });
      return;
    }

    // Validate secret if configured
    const tenantSettings = await db.query.settings.findFirst({ where: eq(settings.tenant_id, tenantId) });
    const secret = tenantSettings?.cloudia_webhook_secret;
    if (secret) {
      const provided = req.headers['x-cloudia-secret'] ?? req.query['secret'];
      if (provided !== secret) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const parsed = parseCloudia(req.body);
    if (!parsed) {
      res.status(200).json({ status: 'ok' });
      return;
    }

    const lead = await findLeadByPhone(parsed.phone, tenantId);
    if (!lead) {
      console.log(`[webhook/cloudia] no lead found for phone ${parsed.phone}, tenant ${tenantId}`);
      res.status(200).json({ status: 'ok' });
      return;
    }

    // Map Cloudia event → lead status
    if (parsed.event === 'appointment_scheduled') {
      await updateLeadStatus(lead.id, 'qualificado');
      console.log(`[webhook/cloudia] lead ${lead.id} → qualificado (appointment_scheduled)`);
    } else if (parsed.event === 'lead_won') {
      await updateLeadStatus(lead.id, 'ganho');
      console.log(`[webhook/cloudia] lead ${lead.id} → ganho (lead_won)`);
    } else if (parsed.event === 'contact_updated' && parsed.name) {
      await db.update(leads).set({ nome: parsed.name }).where(eq(leads.id, lead.id));
      console.log(`[webhook/cloudia] lead ${lead.id} name updated`);
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[webhook/cloudia] error:', err);
    res.status(200).json({ status: 'ok' });
  }
});

export { router as webhookRouter };

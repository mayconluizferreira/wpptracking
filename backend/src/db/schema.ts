import {
  pgTable,
  pgEnum,
  serial,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enums
export const leadStatusEnum = pgEnum('lead_status', [
  'novo',
  'em_atendimento',
  'qualificado',
  'ganho',
  'perdido',
]);

export const leadOrigemEnum = pgEnum('lead_origem', ['anuncio', 'organico']);

export const messageDirecaoEnum = pgEnum('message_direcao', ['entrada', 'saida']);

export const messageTipoEnum = pgEnum('message_tipo', [
  'texto',
  'imagem',
  'audio',
  'video',
  'documento',
  'sticker',
  'outros',
]);

export const webhookSourceEnum = pgEnum('webhook_source', [
  'whatsapp_cloud',
  'evolution',
  'cloudia',
]);

export const attributionModelEnum = pgEnum('attribution_model', [
  'primeiro_clique',
  'ultimo_clique',
]);

// ─── Multi-tenancy ────────────────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  name: text('name'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── Tables ───────────────────────────────────────────────────────────────────

export const connections = pgTable('connections', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  is_active: boolean('is_active').default(true),
  is_paused: boolean('is_paused').default(false),
  // Meta
  meta_access_token: text('meta_access_token'),
  meta_pixel_id: text('meta_pixel_id'),
  meta_page_id: text('meta_page_id'),
  meta_ad_account_id: text('meta_ad_account_id'),
  // Evolution
  evolution_api_url: text('evolution_api_url'),
  evolution_api_key: text('evolution_api_key'),
  // WhatsApp Cloud
  verify_token: text('verify_token'),
  app_secret: text('app_secret'),
  // Config
  attribution_model: attributionModelEnum('attribution_model').default('ultimo_clique'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  meta_access_token: text('meta_access_token'),
  meta_pixel_id: text('meta_pixel_id'),
  meta_page_id: text('meta_page_id'),
  cloudia_webhook_secret: text('cloudia_webhook_secret'),
  evolution_api_url: text('evolution_api_url'),
  evolution_api_key: text('evolution_api_key'),
  verify_token: text('verify_token'),
  meta_ad_account_id: text('meta_ad_account_id'),
  meta_waba_id: text('meta_waba_id'),
  attribution_model: attributionModelEnum('attribution_model').default('ultimo_clique'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  nome: text('nome'),
  telefone: text('telefone').notNull(),
  mensagem_inicial: text('mensagem_inicial'),
  link_whatsapp: text('link_whatsapp'),
  origem: leadOrigemEnum('origem').default('organico'),
  status: leadStatusEnum('status').default('novo'),
  data_entrada: timestamp('data_entrada', { withTimezone: true }).defaultNow(),
  data_qualificacao: timestamp('data_qualificacao', { withTimezone: true }),
  data_ganho: timestamp('data_ganho', { withTimezone: true }),
  // Ad attribution
  ctwaclid: text('ctwaclid'),
  source_id: text('source_id'),
  campanha: text('campanha'),
  conjunto_anuncio: text('conjunto_anuncio'),
  anuncio: text('anuncio'),
  titulo_anuncio: text('titulo_anuncio'),
  tipo_midia: text('tipo_midia'),
  thumbnail_url: text('thumbnail_url'),
  url_anuncio: text('url_anuncio'),
  // Sale value (filled in when status becomes 'ganho')
  valor: numeric('valor', { precision: 12, scale: 2 }),
  moeda: text('moeda').default('BRL'),
  // CAPI flags
  lead_submitted_sent: boolean('lead_submitted_sent').default(false),
  qualified_lead_sent: boolean('qualified_lead_sent').default(false),
  purchase_sent: boolean('purchase_sent').default(false),
  capi_retry_count: integer('capi_retry_count').default(0),
  // Connection
  connection_id: integer('connection_id').references(() => connections.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  lead_id: integer('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  direcao: messageDirecaoEnum('direcao').notNull(),
  conteudo: text('conteudo'),
  tipo: messageTipoEnum('tipo').default('texto'),
  message_id_whatsapp: text('message_id_whatsapp'),
  timestamp_whatsapp: timestamp('timestamp_whatsapp', { withTimezone: true }),
  veio_de_anuncio: boolean('veio_de_anuncio').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const webhook_logs = pgTable('webhook_logs', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  source: webhookSourceEnum('source').notNull(),
  payload: jsonb('payload').notNull(),
  processed: boolean('processed').default(false),
  error: text('error'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const triggerPhrases = pgTable('trigger_phrases', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  status: leadStatusEnum('status').notNull(),
  phrase: text('phrase').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Type exports
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type WebhookLog = typeof webhook_logs.$inferSelect;
export type NewWebhookLog = typeof webhook_logs.$inferInsert;

export type LeadStatus = 'novo' | 'em_atendimento' | 'qualificado' | 'ganho' | 'perdido';
export type LeadOrigem = 'anuncio' | 'organico';
export type MessageDirecao = 'entrada' | 'saida';
export type MessageTipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'outros';
export type WebhookSource = 'whatsapp_cloud' | 'evolution' | 'cloudia';
export type AttributionModel = 'primeiro_clique' | 'ultimo_clique';
export type TriggerPhrase = typeof triggerPhrases.$inferSelect;
export type NewTriggerPhrase = typeof triggerPhrases.$inferInsert;

export type LeadStatus = 'novo' | 'em_atendimento' | 'qualificado' | 'ganho' | 'perdido';
export type LeadOrigem = 'anuncio' | 'organico';
export type MessageDirecao = 'entrada' | 'saida';
export type MessageTipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'outros';
export type WebhookSource = 'whatsapp_cloud' | 'evolution' | 'cloudia';
export type AttributionModel = 'primeiro_clique' | 'ultimo_clique';

export interface Lead {
  id: number;
  nome: string | null;
  telefone: string;
  mensagem_inicial: string | null;
  link_whatsapp: string | null;
  origem: LeadOrigem | null;
  status: LeadStatus | null;
  data_entrada: string | null;
  data_qualificacao: string | null;
  data_ganho: string | null;
  ctwaclid: string | null;
  source_id: string | null;
  campanha: string | null;
  conjunto_anuncio: string | null;
  anuncio: string | null;
  titulo_anuncio: string | null;
  tipo_midia: string | null;
  thumbnail_url: string | null;
  url_anuncio: string | null;
  valor: string | null;
  moeda: string | null;
  lead_submitted_sent: boolean | null;
  qualified_lead_sent: boolean | null;
  purchase_sent: boolean | null;
  capi_retry_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  ultima_mensagem?: string | null;
  message_count?: number;
}

export interface Message {
  id: number;
  lead_id: number;
  direcao: MessageDirecao;
  conteudo: string | null;
  tipo: MessageTipo | null;
  message_id_whatsapp: string | null;
  timestamp_whatsapp: string | null;
  veio_de_anuncio: boolean | null;
  created_at: string | null;
}

export interface Settings {
  id: number;
  meta_access_token: string | null;
  meta_pixel_id: string | null;
  meta_page_id: string | null;
  cloudia_webhook_secret: string | null;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  verify_token: string | null;
  meta_ad_account_id: string | null;
  meta_waba_id: string | null;
  attribution_model: AttributionModel | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Connection {
  id: number;
  name: string;
  is_active: boolean | null;
  is_paused: boolean | null;
  meta_access_token: string | null;
  meta_pixel_id: string | null;
  meta_page_id: string | null;
  meta_ad_account_id: string | null;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  verify_token: string | null;
  app_secret: string | null;
  attribution_model: AttributionModel | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WebhookLog {
  id: number;
  source: WebhookSource;
  payload: unknown;
  processed: boolean | null;
  error: string | null;
  created_at: string | null;
}

export interface Stats {
  leads_hoje: number;
  leads_semana: number;
  leads_mes: number;
  total: number;
  taxa_conversao: number;
  by_status: Record<string, number>;
  by_origem: Record<string, number>;
  top_campanhas: Array<{ campanha: string; total: number }>;
  top_anuncios: Array<{ anuncio: string; total: number }>;
  recent_leads: RecentLead[];
}

export interface RecentLead {
  id: number;
  nome: string | null;
  telefone: string;
  status: string | null;
  origem: string | null;
  data_entrada: string | null;
}

export interface WebhookUrls {
  whatsapp: string;
  evolution: string;
  cloudia: string;
}

export interface TriggerPhrase {
  id: number;
  tenant_id: number;
  status: LeadStatus;
  phrase: string;
  created_at: string | null;
}

export interface LeadFilters {
  status?: string;
  origem?: string;
  search?: string;
  campanha?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

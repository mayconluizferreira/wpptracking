import type { MessageDirecao, MessageTipo, WebhookSource } from '../db/schema';

export interface ParsedMessage {
  phone: string;
  name: string | null;
  content: string | null;
  messageId: string | null;
  timestamp: string; // ISO UTC
  direction: MessageDirecao;
  tipo: MessageTipo;
  ctwaclid: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  tituloAnuncio: string | null;
  tipoMidia: string | null;
  thumbnailUrl: string | null;
  veioDeAnuncio: boolean;
  source: WebhookSource;
  rawPayload: unknown;
  imageBase64: string | null;
}

export interface ParsedCloudiaEvent {
  event: 'lead_won' | 'appointment_scheduled' | 'contact_updated';
  phone: string;
  name: string | null;
  rawPayload: unknown;
}

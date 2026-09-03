import type { ParsedMessage } from '../types/parsed-message';
import { normalizePhone } from '../services/hash';

interface EvolutionPayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { caption?: string; base64?: string };
      videoMessage?: { caption?: string };
      documentMessage?: { caption?: string; fileName?: string };
      audioMessage?: Record<string, unknown>;
      stickerMessage?: Record<string, unknown>;
      base64?: string;
    };
    contextInfo?: {
      externalAdReply?: {
        title?: string;
        body?: string;
        mediaType?: string;
        thumbnailUrl?: string;
        mediaUrl?: string;
        sourceType?: string;
        sourceId?: string;
        sourceUrl?: string;
        ctwaClid?: string;
        sourceApp?: string;
      };
    };
    messageTimestamp?: number;
  };
}

function detectTipo(message: EvolutionPayload['data']['message']): ParsedMessage['tipo'] {
  if (!message) return 'outros';
  if (message.conversation || message.extendedTextMessage) return 'texto';
  if (message.imageMessage) return 'imagem';
  if (message.videoMessage) return 'video';
  if (message.documentMessage) return 'documento';
  if (message.audioMessage) return 'audio';
  if (message.stickerMessage) return 'sticker';
  return 'outros';
}

// When "Webhook Base64" is enabled on the Evolution instance, media messages
// carry the decoded file as base64 — either on the specific media type
// object (e.g. imageMessage.base64) or on the message object itself,
// depending on Evolution's version. Check both.
function extractImageBase64(message: EvolutionPayload['data']['message']): string | null {
  if (!message?.imageMessage) return null;
  return message.imageMessage.base64 ?? message.base64 ?? null;
}

function extractContent(message: EvolutionPayload['data']['message']): string | null {
  if (!message) return null;
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    null
  );
}

export function parseEvolution(payload: unknown): ParsedMessage | null {
  try {
    const data = payload as EvolutionPayload;

    if (data.event !== 'messages.upsert') return null;

    const key = data.data?.key;
    if (!key) return null;

    const rawPhone = key.remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    const phone = normalizePhone(rawPhone);
    if (!phone) return null;

    const isOutgoing = key.fromMe === true;

    // For outgoing messages, only pass content — no ad attribution
    if (isOutgoing) {
      const timestamp = data.data?.messageTimestamp
        ? new Date(data.data.messageTimestamp * 1000).toISOString()
        : new Date().toISOString();
      return {
        phone,
        name: null,
        content: extractContent(data.data?.message),
        messageId: key.id,
        timestamp,
        direction: 'saida',
        tipo: detectTipo(data.data?.message),
        ctwaclid: null,
        sourceId: null,
        sourceUrl: null,
        tituloAnuncio: null,
        tipoMidia: null,
        thumbnailUrl: null,
        veioDeAnuncio: false,
        source: 'evolution',
        rawPayload: payload,
        imageBase64: null,
      };
    }

    const adReply = data.data?.contextInfo?.externalAdReply;
    const veioDeAnuncio = !!adReply?.ctwaClid;

    const timestamp = data.data?.messageTimestamp
      ? new Date(data.data.messageTimestamp * 1000).toISOString()
      : new Date().toISOString();

    return {
      phone,
      name: data.data?.pushName ?? null,
      content: extractContent(data.data?.message),
      messageId: key.id,
      timestamp,
      direction: 'entrada',
      tipo: detectTipo(data.data?.message),
      ctwaclid: adReply?.ctwaClid ?? null,
      sourceId: adReply?.sourceId ?? null,
      sourceUrl: adReply?.sourceUrl ?? null,
      tituloAnuncio: adReply?.title ?? null,
      tipoMidia: adReply?.mediaType?.toLowerCase() ?? null,
      thumbnailUrl: adReply?.thumbnailUrl ?? null,
      veioDeAnuncio,
      source: 'evolution',
      rawPayload: payload,
      imageBase64: extractImageBase64(data.data?.message),
    };
  } catch {
    return null;
  }
}

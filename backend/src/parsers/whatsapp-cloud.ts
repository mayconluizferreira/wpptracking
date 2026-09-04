import type { ParsedMessage } from '../types/parsed-message';
import { normalizePhoneFromJid } from '../services/hash';

interface WhatsAppCloudPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { caption?: string; mime_type?: string; sha256?: string; id?: string };
          audio?: { id?: string; mime_type?: string };
          video?: { caption?: string; id?: string; mime_type?: string };
          document?: { caption?: string; filename?: string; id?: string; mime_type?: string };
          sticker?: { id?: string; mime_type?: string };
          referral?: {
            source_url?: string;
            source_type?: string;
            source_id?: string;
            headline?: string;
            body?: string;
            ctwa_clid?: string;
            media_type?: string;
            image_url?: string;
            video_url?: string;
            thumbnail_url?: string;
          };
        }>;
        statuses?: unknown[];
      };
      field: string;
    }>;
  }>;
}

function mapType(type: string): ParsedMessage['tipo'] {
  const map: Record<string, ParsedMessage['tipo']> = {
    text: 'texto',
    image: 'imagem',
    audio: 'audio',
    video: 'video',
    document: 'documento',
    sticker: 'sticker',
  };
  return map[type] ?? 'outros';
}

export function parseWhatsAppCloud(payload: unknown): ParsedMessage | null {
  try {
    const data = payload as WhatsAppCloudPayload;
    if (data.object !== 'whatsapp_business_account') return null;

    const change = data.entry?.[0]?.changes?.[0]?.value;
    if (!change) return null;

    // Ignore anything that isn't an incoming message (status updates, reactions, etc.)
    if (!change.messages || change.messages.length === 0) return null;

    const msg = change.messages[0];
    // Only process message types — ignore system/ephemeral events
    const validTypes = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'button', 'interactive'];
    if (!validTypes.includes(msg.type)) return null;

    // Only process incoming messages (from field = customer phone)
    const contact = change.contacts?.[0];
    const phone = normalizePhoneFromJid(msg.from || contact?.wa_id || '');
    if (!phone) return null;

    const name = contact?.profile?.name ?? null;
    const referral = msg.referral;
    const veioDeAnuncio = !!referral?.ctwa_clid;

    let content: string | null = null;
    if (msg.type === 'text' && msg.text?.body) {
      content = msg.text.body;
    } else if (msg.image?.caption) {
      content = msg.image.caption;
    } else if (msg.video?.caption) {
      content = msg.video.caption;
    } else if (msg.document?.caption) {
      content = msg.document.caption;
    }

    const timestamp = new Date(parseInt(msg.timestamp, 10) * 1000).toISOString();

    return {
      phone,
      name,
      content,
      messageId: msg.id,
      timestamp,
      direction: 'entrada',
      tipo: mapType(msg.type),
      ctwaclid: referral?.ctwa_clid ?? null,
      sourceId: referral?.source_id ?? null,
      sourceUrl: referral?.source_url ?? null,
      tituloAnuncio: referral?.headline ?? null,
      tipoMidia: referral?.media_type?.toLowerCase() ?? null,
      thumbnailUrl: referral?.thumbnail_url ?? null,
      veioDeAnuncio,
      source: 'whatsapp_cloud',
      rawPayload: payload,
      imageBase64: null,
    };
  } catch {
    return null;
  }
}

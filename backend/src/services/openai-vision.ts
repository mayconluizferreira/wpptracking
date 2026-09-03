// Reads a Pix payment receipt image and extracts the paid value, using
// OpenAI's vision-capable chat completions API. Used to auto-mark a lead as
// "ganho" when the customer sends proof of payment as an image, without
// requiring the attendant to type the value in manually.

const OPENAI_BASE = 'https://api.openai.com/v1';
const MODEL = 'gpt-4o-mini';

export interface ReceiptExtraction {
  isPaymentReceipt: boolean;
  value: number | null;
  currency: string;
  confidence: 'high' | 'low';
}

const SYSTEM_PROMPT = `Você analisa imagens de comprovantes de pagamento (Pix, transferência, boleto) enviados por clientes no WhatsApp de uma joalheria brasileira.

Responda APENAS com um JSON no formato exato:
{"isPaymentReceipt": boolean, "value": number|null, "currency": "BRL", "confidence": "high"|"low"}

Regras:
- isPaymentReceipt: true somente se a imagem for claramente um comprovante de pagamento (Pix, TED, boleto pago, etc). Se for uma foto de joia, print de conversa, ou qualquer outra coisa, retorne false.
- value: o valor pago, em número (ex: 450.00). null se não conseguir ler com segurança.
- confidence: "high" somente se o valor estiver nítido e sem ambiguidade. "low" se a imagem estiver cortada, borrada, ou o valor não estiver 100% claro — nesse caso ainda tente extrair um value, mas marque confidence como "low".
- Nunca invente um valor. Se não tiver certeza, confidence deve ser "low".`;

export async function extractPaymentValue(
  base64Image: string,
  apiKey: string
): Promise<ReceiptExtraction | null> {
  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: 'json_object' },
        max_tokens: 200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analise esta imagem e retorne o JSON pedido.' },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[openai-vision] API error:', err);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ReceiptExtraction>;
    return {
      isPaymentReceipt: !!parsed.isPaymentReceipt,
      value: typeof parsed.value === 'number' ? parsed.value : null,
      currency: parsed.currency ?? 'BRL',
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
    };
  } catch (err) {
    console.error('[openai-vision] extractPaymentValue exception:', err);
    return null;
  }
}

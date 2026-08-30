import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
  Clock,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  Mic,
  Video,
  FileText,
} from 'lucide-react';
import { useLeadMessages, useUpdateLead } from '../../hooks/useLeads';
import { StatusBadge } from '../ui/Badge';
import { formatDateTime, formatTime } from '../../utils/format';
import type { Lead, LeadStatus, MessageTipo } from '../../types';

function MessageTypeIcon({ tipo }: { tipo: MessageTipo | null }) {
  switch (tipo) {
    case 'imagem': return <ImageIcon className="w-3 h-3" />;
    case 'audio': return <Mic className="w-3 h-3" />;
    case 'video': return <Video className="w-3 h-3" />;
    case 'documento': return <FileText className="w-3 h-3" />;
    default: return null;
  }
}

function TimelineItem({ label, date, color }: { label: string; date: string | null; color: string }) {
  const dotColors: Record<string, string> = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
  };
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColors[color] ?? 'bg-gray-500'}`} />
      <div>
        <p className="text-xs font-medium text-gray-300">{label}</p>
        <p className="text-xs text-gray-500">{formatDateTime(date)}</p>
      </div>
    </div>
  );
}

function CapiBadge({ label, sent }: { label: string; sent: boolean | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      {sent ? (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <CheckCircle className="w-3.5 h-3.5" />
          Enviado
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <XCircle className="w-3.5 h-3.5" />
          Pendente
        </span>
      )}
    </div>
  );
}

const STATUS_OPTIONS: LeadStatus[] = ['novo', 'em_atendimento', 'qualificado', 'ganho', 'perdido'];

interface ChatPanelProps {
  lead: Lead;
  compact?: boolean; // When true, hides side info (used inside modal)
}

export function ChatPanel({ lead, compact = false }: ChatPanelProps) {
  const leadId = lead.id;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [askingValor, setAskingValor] = useState(false);
  const [valorInput, setValorInput] = useState('');

  const { data: msgPages, fetchNextPage, hasNextPage, isLoading: loadingMsgs } = useLeadMessages(leadId);
  const updateLead = useUpdateLead();

  // 'ganho' needs a sale value to send the Purchase event to Meta CAPI —
  // ask for it inline instead of firing the status change immediately.
  function handleStatusClick(s: LeadStatus) {
    if (s === 'ganho' && lead.status !== 'ganho') {
      setValorInput(lead.valor ?? '');
      setAskingValor(true);
      return;
    }
    updateLead.mutate({ id: leadId, data: { status: s } });
  }

  function confirmGanho() {
    const valor = parseFloat(valorInput.replace(',', '.'));
    updateLead.mutate({
      id: leadId,
      data: { status: 'ganho', ...(valor > 0 ? { valor, moeda: 'BRL' } : {}) },
    });
    setAskingValor(false);
  }

  const valorPrompt = askingValor ? (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
      <p className="text-xs text-gray-400">Valor da venda (R$) — opcional, mas necessário pra Meta otimizar por ROAS</p>
      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          autoFocus
          value={valorInput}
          onChange={(e) => setValorInput(e.target.value)}
          placeholder="0,00"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
        />
        <button
          onClick={confirmGanho}
          disabled={updateLead.isPending}
          className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
        >
          Confirmar
        </button>
        <button
          onClick={() => setAskingValor(false)}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  ) : null;

  const allMessages = msgPages?.pages.flatMap((p) => p.messages) ?? [];

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  const chatPanel = (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col" style={{ height: compact ? '60vh' : 'calc(100vh - 12rem)', minHeight: 300 }}>
      <div className="px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-300">
          Histórico de Mensagens
          {lead.message_count != null && (
            <span className="ml-2 text-gray-500 font-normal">({lead.message_count})</span>
          )}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse gap-2">
        {loadingMsgs && allMessages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm">Carregando mensagens...</div>
        ) : allMessages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm">Nenhuma mensagem ainda</div>
        ) : (
          <>
            <div ref={sentinelRef} className="h-1" />
            {hasNextPage && (
              <div className="text-center text-xs text-gray-500 py-2">Carregando mais...</div>
            )}
            {[...allMessages].reverse().map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direcao === 'saida' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    msg.direcao === 'saida'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                  }`}
                >
                  {msg.veio_de_anuncio && (
                    <div className="flex items-center gap-1 mb-1">
                      <Megaphone className="w-3 h-3 text-green-400" />
                      <span className="text-xs text-green-400">Via anúncio</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs opacity-60 mb-1">
                    <MessageTypeIcon tipo={msg.tipo} />
                    {msg.tipo !== 'texto' && msg.tipo && (
                      <span className="capitalize">{msg.tipo}</span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {msg.conteudo ?? `[${msg.tipo ?? 'mensagem'}]`}
                  </p>
                  <p className={`text-xs mt-1 ${msg.direcao === 'saida' ? 'text-blue-200' : 'text-gray-500'}`}>
                    {formatTime(msg.timestamp_whatsapp ?? msg.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-4">
        {/* Status selector in compact mode */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Status</p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusClick(s)}
                disabled={updateLead.isPending}
                className={`transition-opacity hover:opacity-80 ${s === lead.status ? 'ring-2 ring-white/20 rounded-full' : 'opacity-50'}`}
              >
                <StatusBadge status={s} size="md" />
              </button>
            ))}
          </div>
          {valorPrompt}
        </div>

        {/* Ad data compact */}
        {lead.origem === 'anuncio' && lead.campanha && (
          <div className="bg-gray-800/50 rounded-lg px-3 py-2 text-xs text-gray-400 flex flex-wrap gap-x-4">
            {lead.campanha && <span><span className="text-gray-500">Campanha:</span> {lead.campanha}</span>}
            {lead.anuncio && <span><span className="text-gray-500">Anúncio:</span> {lead.anuncio}</span>}
          </div>
        )}

        {chatPanel}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left column */}
      <div className="lg:col-span-2 space-y-4">
        {/* Status selector */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusClick(s)}
                  disabled={updateLead.isPending}
                  className={`transition-opacity hover:opacity-80 ${s === lead.status ? 'ring-2 ring-white/20 rounded-full' : 'opacity-50'}`}
                >
                  <StatusBadge status={s} size="md" />
                </button>
              ))}
            </div>
            {valorPrompt}
          </div>
        </div>

        {/* Ad data */}
        {lead.origem === 'anuncio' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-4">
              <Megaphone className="w-4 h-4 text-green-400" />
              Dados do Anúncio
            </h3>
            {lead.thumbnail_url && (
              <img
                src={lead.thumbnail_url}
                alt="Thumbnail do anúncio"
                className="w-full h-32 object-cover rounded-lg mb-3"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="space-y-2 text-sm">
              {lead.titulo_anuncio && (
                <div><p className="text-xs text-gray-500">Título</p><p className="text-gray-200">{lead.titulo_anuncio}</p></div>
              )}
              {lead.campanha && (
                <div><p className="text-xs text-gray-500">Campanha</p><p className="text-gray-200">{lead.campanha}</p></div>
              )}
              {lead.conjunto_anuncio && (
                <div><p className="text-xs text-gray-500">Conjunto de Anúncios</p><p className="text-gray-200">{lead.conjunto_anuncio}</p></div>
              )}
              {lead.anuncio && (
                <div><p className="text-xs text-gray-500">Anúncio</p><p className="text-gray-200">{lead.anuncio}</p></div>
              )}
              {lead.tipo_midia && (
                <div><p className="text-xs text-gray-500">Tipo de Mídia</p><p className="text-gray-200 capitalize">{lead.tipo_midia}</p></div>
              )}
              {lead.ctwaclid && (
                <div><p className="text-xs text-gray-500">CTWA Click ID</p><p className="text-gray-400 text-xs font-mono truncate">{lead.ctwaclid}</p></div>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-blue-400" />
            Timeline
          </h3>
          <div className="space-y-3">
            <TimelineItem label="Entrada" date={lead.data_entrada} color="blue" />
            {lead.data_qualificacao && (
              <TimelineItem label="Qualificado" date={lead.data_qualificacao} color="purple" />
            )}
            {lead.data_ganho && (
              <TimelineItem label="Ganho" date={lead.data_ganho} color="green" />
            )}
          </div>
          {lead.valor && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-500">Valor da venda</p>
              <p className="text-sm font-semibold text-green-400">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: lead.moeda ?? 'BRL' }).format(parseFloat(lead.valor))}
              </p>
            </div>
          )}
        </div>

        {/* CAPI Status */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Status CAPI</h3>
          <div className="space-y-2">
            <CapiBadge label="LeadSubmitted" sent={lead.lead_submitted_sent} />
            <CapiBadge label="QualifiedLead" sent={lead.qualified_lead_sent} />
            <CapiBadge label="Purchase" sent={lead.purchase_sent} />
          </div>
        </div>
      </div>

      {/* Right column — Messages */}
      <div className="lg:col-span-3">
        {chatPanel}
      </div>
    </div>
  );
}

import { ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { StatusBadge, OrigemBadge } from '../ui/Badge';
import { StatusDropdown } from '../ui/StatusDropdown';
import { formatDateTime, formatPhone, truncate, getCountryInfo } from '../../utils/format';
import type { Lead, LeadStatus } from '../../types';

interface LeadCardProps {
  lead: Lead;
  onClick: () => void;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-3.5 cursor-pointer transition-colors hover:bg-gray-800/50 space-y-2.5"
    >
      {/* Nome + Avatar */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-semibold text-gray-200">
            {(lead.nome ?? lead.telefone).charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="font-medium text-white text-sm truncate">
          {lead.nome ?? 'Sem nome'}
        </span>
        <span title={getCountryInfo(lead.telefone).label} className="text-sm flex-shrink-0">
          {getCountryInfo(lead.telefone).flag}
        </span>
      </div>

      {/* Telefone */}
      <a
        href={`https://wa.me/${lead.telefone}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 w-fit"
        onClick={(e) => e.stopPropagation()}
      >
        {formatPhone(lead.telefone)}
        <ExternalLink className="w-3 h-3" />
      </a>

      {/* Origem + Status */}
      <div className="flex items-center gap-2 flex-wrap">
        <OrigemBadge origem={lead.origem} />
        <div onClick={(e) => e.stopPropagation()}>
          <StatusDropdown leadId={lead.id} currentStatus={lead.status as LeadStatus} />
        </div>
      </div>

      {/* Campanha */}
      {lead.campanha && (
        <p className="text-xs text-gray-500 truncate">
          <span className="text-gray-600">Campanha:</span> {lead.campanha}
        </p>
      )}

      {/* Entrada + CAPI status */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-600">{formatDateTime(lead.data_entrada)}</p>
        {lead.origem === 'anuncio' && (
          lead.lead_submitted_sent
            ? (
              <span className="flex items-center gap-1 text-xs text-green-500" title="LeadSubmitted enviado ao Meta">
                <CheckCircle2 className="w-3 h-3" />
                Meta
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-500" title="Aguardando envio ao Meta">
                <Clock className="w-3 h-3" />
                Meta
              </span>
            )
        )}
      </div>

      {/* Última mensagem */}
      {lead.ultima_mensagem && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
          {truncate(lead.ultima_mensagem, 80)}
        </p>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ExternalLink, ChevronLeft, ChevronRight, LayoutList, Kanban, Plus, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLeads } from '../hooks/useLeads';
import { StatusBadge, OrigemBadge } from '../components/ui/Badge';
import { StatusDropdown } from '../components/ui/StatusDropdown';
import { LeadCard } from '../components/Leads/LeadCard';
import { ChatModal } from '../components/Leads/ChatModal';
import { formatDateTime, formatPhone, truncate, getCountryInfo } from '../utils/format';
import { triggerPhrasesService } from '../services/api';
import toast from 'react-hot-toast';
import type { LeadFilters, LeadStatus, LeadOrigem } from '../types';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'novo', label: 'Novo' },
  { value: 'em_atendimento', label: 'Em Atendimento' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'ganho', label: 'Ganho' },
  { value: 'perdido', label: 'Perdido' },
];

const ORIGEM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas as origens' },
  { value: 'anuncio', label: 'Anúncio' },
  { value: 'organico', label: 'Orgânico' },
];

const PAIS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os países' },
  { value: 'BR', label: '🇧🇷 Brasil' },
  { value: 'US', label: '🇺🇸 Estados Unidos' },
];

const PIPELINE_COLUMNS: Array<{
  status: LeadStatus;
  label: string;
  headerClass: string;
}> = [
  { status: 'novo', label: 'Novo', headerClass: 'text-blue-400 border-blue-500/40' },
  { status: 'em_atendimento', label: 'Em Atendimento', headerClass: 'text-yellow-400 border-yellow-500/40' },
  { status: 'qualificado', label: 'Qualificado', headerClass: 'text-purple-400 border-purple-500/40' },
  { status: 'ganho', label: 'Ganho', headerClass: 'text-green-400 border-green-500/40' },
  { status: 'perdido', label: 'Perdido', headerClass: 'text-red-400 border-red-500/40' },
];

type ViewMode = 'tabela' | 'pipeline';

function getStoredView(): ViewMode {
  try {
    const v = localStorage.getItem('leads_view');
    return v === 'pipeline' ? 'pipeline' : 'tabela';
  } catch {
    return 'tabela';
  }
}

export default function Leads() {
  const [view, setView] = useState<ViewMode>(getStoredView);
  const [filters, setFilters] = useState<LeadFilters>({ page: 1, limit: 50 });
  const [search, setSearch] = useState('');
  const [chatLeadId, setChatLeadId] = useState<number | null>(null);

  // Trigger phrases
  const qc = useQueryClient();
  const [addingForStatus, setAddingForStatus] = useState<LeadStatus | null>(null);
  const [addInputValue, setAddInputValue] = useState('');

  const { data: triggerPhrases = [] } = useQuery({
    queryKey: ['trigger-phrases'],
    queryFn: () => triggerPhrasesService.list().then((r) => r.data),
  });

  const createPhrase = useMutation({
    mutationFn: (data: { status: LeadStatus; phrase: string }) =>
      triggerPhrasesService.create(data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trigger-phrases'] });
      setAddingForStatus(null);
      setAddInputValue('');
    },
    onError: () => toast.error('Erro ao salvar gatilho'),
  });

  const deletePhrase = useMutation({
    mutationFn: (id: number) => triggerPhrasesService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trigger-phrases'] }),
    onError: () => toast.error('Erro ao remover gatilho'),
  });

  function handleAddPhrase(status: LeadStatus) {
    const phrase = addInputValue.trim();
    if (!phrase) { setAddingForStatus(null); return; }
    createPhrase.mutate({ status, phrase });
  }

  function copyPhrase(phrase: string) {
    navigator.clipboard.writeText(phrase).then(() => toast.success('Frase copiada!'));
  }

  // For pipeline mode fetch all (up to 500)
  const pipelineFilters: LeadFilters = { ...filters, page: 1, limit: 500 };
  const { data: pipelineData } = useLeads(pipelineFilters);
  const { data, isLoading } = useLeads(view === 'tabela' ? filters : pipelineFilters);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setFilters((f) => ({ ...f, search: search || undefined, page: 1 }));
  }

  function setFilter(key: keyof LeadFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
  }

  function switchView(v: ViewMode) {
    setView(v);
    try { localStorage.setItem('leads_view', v); } catch { /* */ }
  }

  const totalPages = data ? Math.ceil(data.total / (filters.limit ?? 50)) : 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-48">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
            >
              Buscar
            </button>
          </form>

          {/* Status */}
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            onChange={(e) => setFilter('status', e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Origem */}
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            onChange={(e) => setFilter('origem', e.target.value)}
          >
            {ORIGEM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* País */}
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            onChange={(e) => setFilter('pais', e.target.value)}
          >
            {PAIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Date from */}
          <input
            type="date"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            onChange={(e) => setFilter('date_from', e.target.value)}
          />
          <input
            type="date"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            onChange={(e) => setFilter('date_to', e.target.value)}
          />
        </div>
      </div>

      {/* Count + View toggle */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          {isLoading ? 'Carregando...' : `${data?.total ?? 0} leads encontrados`}
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          <button
            onClick={() => switchView('tabela')}
            title="Tabela"
            className={`p-1.5 rounded-md transition-colors ${
              view === 'tabela' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => switchView('pipeline')}
            title="Pipeline"
            className={`p-1.5 rounded-md transition-colors ${
              view === 'pipeline' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Kanban className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table View */}
      {view === 'tabela' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Telefone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">País</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Origem</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Campanha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Entrada</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Última Mensagem</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Carregando...</td>
                  </tr>
                ) : data?.leads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Nenhum lead encontrado</td>
                  </tr>
                ) : (
                  data?.leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-gray-300">
                              {(lead.nome ?? lead.telefone).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-white">{lead.nome ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://wa.me/${lead.telefone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-400 hover:text-green-300 flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {formatPhone(lead.telefone)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span title={getCountryInfo(lead.telefone).label} className="text-base">
                          {getCountryInfo(lead.telefone).flag}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <OrigemBadge origem={lead.origem} />
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {truncate(lead.campanha, 30)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusDropdown leadId={lead.id} currentStatus={lead.status as LeadStatus} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {formatDateTime(lead.data_entrada)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-48">
                        {truncate(lead.ultima_mensagem, 50)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setChatLeadId(lead.id)}
                            className="text-xs text-green-400 hover:text-green-300 transition-colors"
                          >
                            Chat
                          </button>
                          <Link
                            to={`/leads/${lead.id}`}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            Detalhes
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total > (filters.limit ?? 50) && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
              <span className="text-xs text-gray-500">
                Página {filters.page ?? 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={(filters.page ?? 1) <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={(filters.page ?? 1) >= totalPages}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 min-w-max">
            {PIPELINE_COLUMNS.map((col) => {
              const colLeads = (pipelineData?.leads ?? []).filter((l) => l.status === col.status);
              const colPhrases = triggerPhrases.filter((p) => p.status === col.status);
              const chipColor = col.headerClass.split(' ')[0]; // e.g. "text-blue-400"
              const chipBorder = col.headerClass.split(' ')[1]; // e.g. "border-blue-500/40"
              return (
                <div key={col.status} className="w-72 flex flex-col">
                  {/* Trigger phrases */}
                  <div className="mb-2 min-h-[28px] flex flex-wrap gap-1.5 items-center">
                    {colPhrases.map((p) => (
                      <span
                        key={p.id}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-gray-900 ${chipColor} ${chipBorder}`}
                      >
                        <button
                          onClick={() => copyPhrase(p.phrase)}
                          className="hover:opacity-80 max-w-[160px] truncate"
                          title={`Copiar: ${p.phrase}`}
                        >
                          {p.phrase}
                        </button>
                        <button
                          onClick={() => deletePhrase.mutate(p.id)}
                          className="opacity-40 hover:opacity-100 ml-0.5 flex-shrink-0"
                          title="Remover"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {addingForStatus === col.status ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleAddPhrase(col.status); }}
                        className="flex items-center gap-1"
                      >
                        <input
                          autoFocus
                          value={addInputValue}
                          onChange={(e) => setAddInputValue(e.target.value)}
                          onBlur={() => { if (!addInputValue.trim()) setAddingForStatus(null); }}
                          onKeyDown={(e) => { if (e.key === 'Escape') { setAddingForStatus(null); setAddInputValue(''); } }}
                          placeholder="Ex: Pedido confirmado"
                          className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-white w-36 focus:outline-none focus:border-gray-500"
                        />
                        <button type="submit" className={`text-xs ${chipColor} hover:opacity-80`}>✓</button>
                      </form>
                    ) : (
                      <button
                        onClick={() => { setAddingForStatus(col.status); setAddInputValue(''); }}
                        className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-0.5"
                        title="Adicionar frase-gatilho"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Column header */}
                  <div className={`flex items-center justify-between mb-3 pb-2 border-b ${col.headerClass}`}>
                    <span className={`text-sm font-semibold ${col.headerClass.split(' ')[0]}`}>
                      {col.label}
                    </span>
                    <span className="text-xs bg-gray-800 text-gray-400 rounded-full px-2 py-0.5">
                      {colLeads.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-18rem)] pr-0.5">
                    {isLoading ? (
                      <div className="text-xs text-gray-600 text-center py-4">Carregando...</div>
                    ) : colLeads.length === 0 ? (
                      <div className="text-xs text-gray-700 text-center py-8 border-2 border-dashed border-gray-800 rounded-xl">
                        Nenhum lead
                      </div>
                    ) : (
                      colLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          onClick={() => setChatLeadId(lead.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chat Modal */}
      <ChatModal leadId={chatLeadId} onClose={() => setChatLeadId(null)} />
    </div>
  );
}

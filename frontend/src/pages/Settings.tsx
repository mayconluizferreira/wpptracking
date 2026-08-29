import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, RefreshCw, Plus, Pencil, Trash2, Pause, Play, Shuffle } from 'lucide-react';
import { useSettings, useWebhookUrls, useSaveSettings } from '../hooks/useSettings';
import { useConnections, useCreateConnection, useUpdateConnection, useDeleteConnection } from '../hooks/useConnections';
import { CopyButton } from '../components/ui/CopyButton';
import toast from 'react-hot-toast';
import { settingsService } from '../services/api';
import type { Connection, AttributionModel } from '../types';

type Tab = 'connections' | 'whatsapp' | 'evolution' | 'cloudia' | 'meta';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'connections', label: 'Conexões' },
  { id: 'whatsapp', label: 'Webhook WhatsApp' },
  { id: 'evolution', label: 'Webhook Evolution' },
  { id: 'cloudia', label: 'Webhook Cloudia' },
  { id: 'meta', label: 'Meta Ads / CAPI' },
];

function WebhookField({ label, url }: { label: string; url: string | undefined }) {
  if (!url) return null;
  return (
    <div>
      <p className="text-sm text-gray-400 mb-1.5">{label}</p>
      <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
        <code className="text-green-400 text-sm flex-1 truncate">{url}</code>
        <CopyButton text={url} label="" />
      </div>
    </div>
  );
}

function Step({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs text-gray-300">{num}</span>
      </div>
      <p className="text-sm text-gray-400">{children}</p>
    </div>
  );
}

// ─── Connection form state ────────────────────────────────────────────────────
const EMPTY_FORM: Omit<Connection, 'id' | 'created_at' | 'updated_at'> = {
  name: '',
  is_active: true,
  is_paused: false,
  meta_access_token: null,
  meta_pixel_id: null,
  meta_page_id: null,
  meta_ad_account_id: null,
  evolution_api_url: null,
  evolution_api_key: null,
  verify_token: null,
  app_secret: null,
  attribution_model: 'ultimo_clique',
};

function ConnectionModal({
  initial,
  isEditing,
  onClose,
  onSave,
  saving,
}: {
  initial: typeof EMPTY_FORM;
  isEditing?: boolean;
  onClose: () => void;
  onSave: (data: typeof EMPTY_FORM) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);

  function set(key: keyof typeof EMPTY_FORM, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-white">
          {initial.name ? 'Editar Conexão' : 'Nova Conexão'}
        </h3>

        <div>
          <p className="text-xs text-gray-400 mb-1">Nome da conexão *</p>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Ex: Clínica Principal"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
          />
        </div>

        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Meta</p>
          <div className="space-y-3">
            {(['meta_access_token', 'meta_pixel_id', 'meta_page_id', 'meta_ad_account_id'] as const).map((k) => (
              <div key={k}>
                <p className="text-xs text-gray-400 mb-1">
                  {k === 'meta_access_token' ? 'Access Token' :
                   k === 'meta_pixel_id' ? 'Pixel ID' :
                   k === 'meta_page_id' ? 'Page ID' : 'Ad Account ID (act_xxx)'}
                </p>
                <input
                  type={k === 'meta_access_token' ? 'password' : 'text'}
                  value={form[k] ?? ''}
                  onChange={(e) => set(k, e.target.value || null)}
                  placeholder={k === 'meta_access_token' ? (isEditing ? 'Deixe em branco para manter o atual' : 'EAAxxxx...') : k === 'meta_ad_account_id' ? 'act_123456789' : '123456789'}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Evolution API</p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">URL da Evolution API</p>
              <input
                value={form.evolution_api_url ?? ''}
                onChange={(e) => set('evolution_api_url', e.target.value || null)}
                placeholder="https://evolution.meuservidor.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">API Key</p>
              <input
                type="password"
                value={form.evolution_api_key ?? ''}
                onChange={(e) => set('evolution_api_key', e.target.value || null)}
                placeholder={isEditing ? 'Deixe em branco para manter o atual' : 'sua-api-key'}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">WhatsApp Cloud</p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Verify Token</p>
              <input
                value={form.verify_token ?? ''}
                onChange={(e) => set('verify_token', e.target.value || null)}
                placeholder="token-unico-desta-conexao"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">App Secret</p>
              <input
                type="password"
                value={form.app_secret ?? ''}
                onChange={(e) => set('app_secret', e.target.value || null)}
                placeholder="app-secret-do-meta"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-400 mb-2">Modelo de Atribuição</p>
          <div className="flex gap-4">
            {(['primeiro_clique', 'ultimo_clique'] as AttributionModel[]).map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={m}
                  checked={form.attribution_model === m}
                  onChange={() => set('attribution_model', m)}
                  className="accent-green-500"
                />
                <span className="text-sm text-gray-300">
                  {m === 'primeiro_clique' ? 'Primeiro Clique' : 'Último Clique'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => {
              if (!form.name.trim()) { toast.error('Nome é obrigatório'); return; }
              onSave(form);
            }}
            disabled={saving}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            Salvar
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectionsTab() {
  const { data: connections = [], isLoading } = useConnections();
  const create = useCreateConnection();
  const update = useUpdateConnection();
  const remove = useDeleteConnection();

  const [modal, setModal] = useState<{ open: boolean; editing: Connection | null }>({ open: false, editing: null });

  function openCreate() {
    setModal({ open: true, editing: null });
  }

  function openEdit(c: Connection) {
    setModal({ open: true, editing: c });
  }

  function handleSave(data: typeof EMPTY_FORM) {
    if (modal.editing) {
      update.mutate({ id: modal.editing.id, data }, { onSuccess: () => setModal({ open: false, editing: null }) });
    } else {
      create.mutate(data, { onSuccess: () => setModal({ open: false, editing: null }) });
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-300">Conexões WhatsApp / Meta</h4>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova Conexão
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : connections.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma conexão cadastrada. Crie uma para começar.</p>
      ) : (
        <div className="space-y-3">
          {connections.map((c) => (
            <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white text-sm truncate">{c.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      c.is_paused ? 'bg-yellow-900/50 text-yellow-400' :
                      c.is_active ? 'bg-green-900/50 text-green-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {c.is_paused ? 'Pausada' : c.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {c.meta_pixel_id && <span>Pixel: {c.meta_pixel_id}</span>}
                    {c.verify_token && <span>Verify Token: {c.verify_token}</span>}
                    {c.evolution_api_url && <span>Evolution: {c.evolution_api_url}</span>}
                  </div>
                  {/* Webhook URL for Meta */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">URL Webhook:</span>
                    <code className="text-xs text-green-400 bg-gray-900 px-1.5 py-0.5 rounded truncate max-w-xs">
                      {`${window.location.origin}/webhook/whatsapp/${c.id}`}
                    </code>
                    <CopyButton text={`${window.location.origin}/webhook/whatsapp/${c.id}`} />
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => update.mutate({ id: c.id, data: { is_paused: !c.is_paused } })}
                    title={c.is_paused ? 'Retomar' : 'Pausar'}
                    className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    {c.is_paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remover conexão "${c.name}"?`)) {
                        remove.mutate(c.id);
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <ConnectionModal
          isEditing={!!modal.editing}
          initial={modal.editing ? {
            name: modal.editing.name,
            is_active: modal.editing.is_active,
            is_paused: modal.editing.is_paused,
            // Sensitive fields: clear masked values so user sees placeholder "already saved"
            meta_access_token: null,
            meta_pixel_id: modal.editing.meta_pixel_id,
            meta_page_id: modal.editing.meta_page_id,
            meta_ad_account_id: modal.editing.meta_ad_account_id,
            evolution_api_url: modal.editing.evolution_api_url,
            evolution_api_key: null,
            verify_token: modal.editing.verify_token,
            app_secret: null,
            attribution_model: modal.editing.attribution_model,
          } : EMPTY_FORM}
          onClose={() => setModal({ open: false, editing: null })}
          onSave={handleSave}
          saving={create.isPending || update.isPending}
        />
      )}
    </div>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('connections');
  const { data: settings } = useSettings();
  const { data: urls } = useWebhookUrls();
  const saveSettings = useSaveSettings();

  // Meta tab state
  const [metaToken, setMetaToken] = useState('');
  const [metaPixelId, setMetaPixelId] = useState('');
  const [metaPageId, setMetaPageId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [attributionModel, setAttributionModel] = useState<'primeiro_clique' | 'ultimo_clique'>('ultimo_clique');
  const [testingMeta, setTestingMeta] = useState(false);
  const [metaStatus, setMetaStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  // Cloudia tab state
  const [cloudiaSecret, setCloudiaSecret] = useState('');

  // Verify token tab state
  const [verifyToken, setVerifyToken] = useState('');

  useEffect(() => {
    if (settings) {
      // Don't pre-fill sensitive fields with masked values — leave empty so user knows to re-enter
      setMetaToken('');
      setMetaPixelId(settings.meta_pixel_id ?? '');
      setMetaPageId(settings.meta_page_id ?? '');
      setMetaWabaId(settings.meta_waba_id ?? '');
      setMetaAdAccountId(settings.meta_ad_account_id ?? '');
      setAttributionModel(settings.attribution_model ?? 'ultimo_clique');
      setCloudiaSecret('');
      setVerifyToken(settings.verify_token ?? '');
    }
  }, [settings]);

  async function handleSaveMeta() {
    const payload: Record<string, string | null | undefined> = {
      meta_pixel_id: metaPixelId,
      meta_page_id: metaPageId,
      meta_waba_id: metaWabaId || null,
      meta_ad_account_id: metaAdAccountId || null,
      attribution_model: attributionModel,
    };
    // Only send token if user typed a new value — empty means "keep existing"
    if (metaToken) payload.meta_access_token = metaToken;
    await saveSettings.mutateAsync(payload);
  }

  async function handleSaveCloudia() {
    const payload: Record<string, string | null> = {};
    if (cloudiaSecret) payload.cloudia_webhook_secret = cloudiaSecret;
    await saveSettings.mutateAsync(payload);
  }

  async function testMetaConnection() {
    setTestingMeta(true);
    setMetaStatus('idle');
    try {
      const res = await settingsService.testMeta();
      if (res.data?.ok) {
        setMetaStatus('ok');
        toast.success(`Conexão com Meta OK! Pixel: ${res.data.pixelId}`);
      } else {
        setMetaStatus('error');
        toast.error(`Erro Meta: ${res.data?.error ?? 'Resposta inesperada'}`);
      }
    } catch (err: unknown) {
      setMetaStatus('error');
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Erro ao conectar com o Meta. Verifique o token e pixel ID.';
      toast.error(msg);
    } finally {
      setTestingMeta(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Connections Tab */}
      {activeTab === 'connections' && <ConnectionsTab />}

      {/* WhatsApp Tab */}
      {activeTab === 'whatsapp' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 text-sm text-blue-300">
            A URL de Callback agora é <strong>por conexão</strong>. Acesse a aba <strong>Conexões</strong> para ver e copiar a URL de cada conexão.
          </div>

          {/* Verify Token */}
          <div>
            <p className="text-sm text-gray-400 mb-1.5">Verify Token</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="Ex: meu-token-secreto-123"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
              <button
                onClick={() => {
                  const random = Array.from(crypto.getRandomValues(new Uint8Array(18)))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('');
                  setVerifyToken(random);
                }}
                title="Gerar token aleatório"
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                <Shuffle className="w-4 h-4" />
              </button>
              {verifyToken && <CopyButton text={verifyToken} label="" />}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Cole este mesmo valor no campo "Verificar token" do Meta Business Manager.
            </p>
          </div>

          <button
            onClick={() => saveSettings.mutateAsync({ verify_token: verifyToken })}
            disabled={saveSettings.isPending || !verifyToken}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            Salvar
          </button>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-300">Como cadastrar no Meta Business Manager</h4>
            <Step num={1}>Acesse <strong>developers.facebook.com</strong> e selecione seu App</Step>
            <Step num={2}>Vá em <strong>WhatsApp &gt; Configuração</strong> no menu lateral</Step>
            <Step num={3}>Em "Webhook", clique em <strong>"Editar"</strong></Step>
            <Step num={4}>Cole a <strong>URL de Callback</strong> e o <strong>Verify Token</strong> acima nos campos correspondentes</Step>
            <Step num={5}>Clique em <strong>"Verificar e Salvar"</strong></Step>
            <Step num={6}>Na tela de campos do webhook, inscreva-se em <strong>"messages"</strong></Step>
          </div>
        </div>
      )}

      {/* Evolution Tab */}
      {activeTab === 'evolution' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
          <WebhookField label="URL do Webhook (Evolution API)" url={urls?.evolution} />

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-300">Como configurar na Evolution API</h4>
            <Step num={1}>Acesse o painel da sua Evolution API</Step>
            <Step num={2}>Vá em <strong>Instâncias &gt; [sua instância] &gt; Webhook</strong></Step>
            <Step num={3}>Cole a URL acima no campo "Webhook URL"</Step>
            <Step num={4}>Ative o evento <strong>"messages.upsert"</strong></Step>
            <Step num={5}>Clique em <strong>"Salvar"</strong></Step>
          </div>
        </div>
      )}

      {/* Cloudia Tab */}
      {activeTab === 'cloudia' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
          <WebhookField label="URL do Webhook (Cloudia)" url={urls?.cloudia} />

          <div>
            <p className="text-sm text-gray-400 mb-1.5">Secret de Validação (opcional)</p>
            <input
              type="text"
              value={cloudiaSecret}
              onChange={(e) => setCloudiaSecret(e.target.value)}
              placeholder="Ex: meu-secret-secreto-123"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
            <p className="text-xs text-gray-500 mt-1">Se configurado, o header x-cloudia-secret será validado</p>
          </div>

          <button
            onClick={handleSaveCloudia}
            disabled={saveSettings.isPending}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            Salvar
          </button>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-300">Como configurar no Cloudia</h4>
            <Step num={1}>No painel do Cloudia, vá em <strong>Configurações &gt; Webhooks</strong></Step>
            <Step num={2}>Clique em <strong>"Novo Webhook"</strong></Step>
            <Step num={3}>Selecione o evento desejado (ex: "Lead ganho", "Consulta agendada")</Step>
            <Step num={4}>Cole a URL fornecida acima</Step>
            <Step num={5}>Se usar secret, configure também no Cloudia</Step>
            <Step num={6}>Clique em <strong>"Salvar"</strong></Step>
          </div>
        </div>
      )}

      {/* Meta Tab */}
      {activeTab === 'meta' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
          <div>
            <p className="text-sm text-gray-400 mb-1.5">Access Token</p>
            <input
              type="password"
              value={metaToken}
              onChange={(e) => setMetaToken(e.target.value)}
              placeholder={settings?.meta_access_token ? 'Token salvo — preencha para alterar' : 'EAAxxxx...'}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
            {settings?.meta_access_token && !metaToken && (
              <p className="text-xs text-green-600 mt-1">Token salvo. Para alterar ou testar, preencha o campo acima.</p>
            )}
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-1.5">Pixel ID</p>
            <input
              type="text"
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
              placeholder="123456789012345"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-1.5">Page ID (ID da Página do Facebook)</p>
            <input
              type="text"
              value={metaPageId}
              onChange={(e) => setMetaPageId(e.target.value)}
              placeholder="123456789"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-1.5">
              WABA ID <span className="text-gray-500">(WhatsApp Business Account ID)</span>
            </p>
            <input
              type="text"
              value={metaWabaId}
              onChange={(e) => setMetaWabaId(e.target.value)}
              placeholder="904147868781178"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
            <p className="text-xs text-gray-500 mt-1">
              Obrigatório para enviar eventos CAPI. Encontre em Meta Business Suite → WhatsApp → ID da conta.
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-1.5">
              Ad Account ID <span className="text-gray-500">(opcional)</span>
            </p>
            <input
              type="text"
              value={metaAdAccountId}
              onChange={(e) => setMetaAdAccountId(e.target.value)}
              placeholder="act_123456789"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
            <p className="text-xs text-gray-500 mt-1">
              Se preenchido, valida que cada anúncio clicado pertence à sua conta antes de buscar os dados de campanha
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">Modelo de Atribuição</p>
            <div className="flex gap-4">
              {(['primeiro_clique', 'ultimo_clique'] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={m}
                    checked={attributionModel === m}
                    onChange={() => setAttributionModel(m)}
                    className="accent-green-500"
                  />
                  <span className="text-sm text-gray-300">
                    {m === 'primeiro_clique' ? 'Primeiro Clique' : 'Último Clique'}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {attributionModel === 'primeiro_clique'
                ? 'O anúncio original é sempre mantido para leads recorrentes'
                : 'Sobrescreve o anúncio com o clique mais recente (recomendado)'}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSaveMeta}
              disabled={saveSettings.isPending}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              Salvar
            </button>
            <button
              onClick={testMetaConnection}
              disabled={testingMeta}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-sm rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingMeta ? 'animate-spin' : ''}`} />
              Testar Conexão
            </button>
            {metaStatus === 'ok' && <CheckCircle className="w-5 h-5 text-green-400 self-center" />}
            {metaStatus === 'error' && <XCircle className="w-5 h-5 text-red-400 self-center" />}
          </div>
        </div>
      )}
    </div>
  );
}

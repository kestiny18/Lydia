import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDot, KeyRound, Rocket, Server, Wrench } from 'lucide-react';
import { api } from '../lib/api';
import { Panel } from './ui/Panel';
import { FeedbackState } from './ui/FeedbackState';

interface SetupWorkspaceProps {
  onSetupCompleted?: () => void;
}

export function SetupWorkspace({ onSetupCompleted }: SetupWorkspaceProps) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<'auto' | 'openai' | 'anthropic' | 'ollama' | 'mock'>('auto');
  const [defaultModel, setDefaultModel] = useState('');
  const [fallbackOrder, setFallbackOrder] = useState<string[]>(['ollama', 'openai', 'anthropic']);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');
  const [hasHydrated, setHasHydrated] = useState(false);

  const { data: setupStatus, isLoading: setupLoading } = useQuery({
    queryKey: ['setup'],
    queryFn: () => api.getSetupStatus(),
  });

  const { data: setupConfig, isLoading: configLoading } = useQuery({
    queryKey: ['setup-config'],
    queryFn: () => api.getSetupConfig(),
  });

  useEffect(() => {
    if (!setupConfig || hasHydrated) return;
    const llm = setupConfig.llm || {};
    setProvider((llm.provider || 'auto') as any);
    setDefaultModel(llm.defaultModel || '');
    setFallbackOrder(Array.isArray(llm.fallbackOrder) && llm.fallbackOrder.length > 0
      ? llm.fallbackOrder
      : ['ollama', 'openai', 'anthropic']);
    setOpenaiBaseUrl(llm.openaiBaseUrl || '');
    setAnthropicBaseUrl(llm.anthropicBaseUrl || '');
    setOllamaBaseUrl(llm.ollamaBaseUrl || '');
    setHasHydrated(true);
  }, [setupConfig, hasHydrated]);

  const initMutation = useMutation({
    mutationFn: () => api.initializeSetup(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['setup'] });
      await queryClient.invalidateQueries({ queryKey: ['setup-config'] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        llm: {
          provider,
          defaultModel,
          fallbackOrder,
          openaiBaseUrl,
          anthropicBaseUrl,
          ollamaBaseUrl,
        },
      };
      if (openaiApiKey.trim()) payload.llm.openaiApiKey = openaiApiKey.trim();
      if (anthropicApiKey.trim()) payload.llm.anthropicApiKey = anthropicApiKey.trim();
      return api.updateSetupConfig(payload);
    },
    onSuccess: async () => {
      setOpenaiApiKey('');
      setAnthropicApiKey('');
      await queryClient.invalidateQueries({ queryKey: ['setup'] });
      await queryClient.invalidateQueries({ queryKey: ['setup-config'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.testLLM(true),
  });

  const setupReady = Boolean(setupStatus?.ready);
  const llmConfigured = Boolean(setupStatus?.llmConfigured);
  const currentProvider = setupStatus?.provider || provider;
  const canRun = setupReady && llmConfigured;

  const steps = useMemo(() => ([
    { id: 'workspace', title: 'Initialize Workspace', done: setupReady },
    { id: 'provider', title: 'Configure LLM Provider', done: llmConfigured },
    { id: 'ready', title: 'Ready To Run Tasks', done: canRun },
  ]), [setupReady, llmConfigured, canRun]);

  if (setupLoading || configLoading) {
    return (
      <div className="h-full p-6">
        <FeedbackState type="loading" title="Loading setup status..." />
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-auto space-y-4">
      <Panel
        title="Setup Wizard"
        subtitle="Complete setup once, then run Lydia fully from the dashboard."
        tone="accent"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {steps.map((step, idx) => (
            <div key={step.id} className="rounded-xl border border-[color:var(--line)] bg-white p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {step.done ? <CheckCircle2 size={14} className="text-[color:var(--success)]" /> : <CircleDot size={14} className="text-[color:var(--text-muted)]" />}
                <span>Step {idx + 1}</span>
              </div>
              <div className="mt-1 text-sm text-[color:var(--text-strong)]">{step.title}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel
          title="Step 1: Workspace"
          subtitle="Create local config, strategy, and skill folders."
          actions={(
            <button
              onClick={() => initMutation.mutate()}
              disabled={initMutation.isPending}
              className="px-3 py-1.5 rounded-md text-xs text-white bg-[color:var(--accent)] disabled:opacity-60"
            >
              {setupReady ? 'Re-check' : (initMutation.isPending ? 'Initializing...' : 'Initialize')}
            </button>
          )}
        >
          <div className="text-sm text-[color:var(--text-muted)] space-y-1">
            <div><strong>Status:</strong> {setupReady ? 'Ready' : 'Not initialized'}</div>
            <div><strong>Config:</strong> <span className="font-mono">{setupStatus?.configPath}</span></div>
            <div><strong>Strategy:</strong> <span className="font-mono">{setupStatus?.strategyPath}</span></div>
            {initMutation.isError && (
              <div className="text-[color:var(--danger)] text-xs">{(initMutation.error as Error).message}</div>
            )}
          </div>
        </Panel>

        <Panel
          title="Step 2: LLM Provider"
          subtitle="Configure provider, model, API keys, and endpoints."
          className="xl:col-span-2"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {(['auto', 'openai', 'anthropic', 'ollama', 'mock'] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setProvider(item)}
                  className={`px-2 py-2 rounded-md border text-xs ${
                    provider === item
                      ? 'border-[color:var(--line-strong)] bg-[color:var(--surface-accent)] text-[color:var(--accent)]'
                      : 'border-[color:var(--line)] bg-white text-[color:var(--text-muted)]'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="text-xs text-[color:var(--text-muted)]">
                Default Model
                <input
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="Optional model override"
                  className="mt-1 w-full border border-[color:var(--line)] rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-[color:var(--text-muted)]">
                Fallback Order (auto mode)
                <input
                  value={fallbackOrder.join(',')}
                  onChange={(e) =>
                    setFallbackOrder(
                      e.target.value.split(',').map((item) => item.trim()).filter(Boolean)
                    )
                  }
                  placeholder="ollama,openai,anthropic"
                  className="mt-1 w-full border border-[color:var(--line)] rounded-md px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="text-xs text-[color:var(--text-muted)]">
                OpenAI API Key
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder={setupConfig?.llm?.openaiApiKeyMasked ? `Saved: ${setupConfig.llm.openaiApiKeyMasked}` : 'sk-...'}
                  className="mt-1 w-full border border-[color:var(--line)] rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-[color:var(--text-muted)]">
                Anthropic API Key
                <input
                  type="password"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  placeholder={setupConfig?.llm?.anthropicApiKeyMasked ? `Saved: ${setupConfig.llm.anthropicApiKeyMasked}` : 'sk-ant-...'}
                  className="mt-1 w-full border border-[color:var(--line)] rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-[color:var(--text-muted)]">
                OpenAI Base URL
                <input
                  value={openaiBaseUrl}
                  onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full border border-[color:var(--line)] rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-[color:var(--text-muted)]">
                Anthropic Base URL
                <input
                  value={anthropicBaseUrl}
                  onChange={(e) => setAnthropicBaseUrl(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full border border-[color:var(--line)] rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-[color:var(--text-muted)] md:col-span-2">
                Ollama Base URL
                <input
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/api"
                  className="mt-1 w-full border border-[color:var(--line)] rounded-md px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="px-3 py-1.5 rounded-md text-xs text-white bg-[color:var(--accent)] disabled:opacity-60"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Provider Config'}
              </button>
              <button
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                className="px-3 py-1.5 rounded-md text-xs text-white bg-[color:var(--info)] disabled:opacity-60"
              >
                {testMutation.isPending ? 'Testing...' : 'Test LLM Connection'}
              </button>
              {canRun && (
                <button
                  onClick={onSetupCompleted}
                  className="px-3 py-1.5 rounded-md text-xs border border-[color:var(--line)] text-[color:var(--text-strong)]"
                >
                  Continue To Tasks
                </button>
              )}
            </div>

            {saveMutation.isSuccess && (
              <div className="text-xs text-[color:var(--success)]">Configuration saved.</div>
            )}
            {saveMutation.isError && (
              <div className="text-xs text-[color:var(--danger)]">{(saveMutation.error as Error).message}</div>
            )}
            {testMutation.isSuccess && (
              <div className="text-xs text-[color:var(--success)]">
                LLM check passed with provider <strong>{testMutation.data?.provider}</strong>.
              </div>
            )}
            {testMutation.isError && (
              <div className="text-xs text-[color:var(--danger)]">{(testMutation.error as Error).message}</div>
            )}
            <div className="text-xs text-[color:var(--text-muted)]">
              Current provider: <strong>{currentProvider}</strong>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Workspace Responsibilities" subtitle="Defines the boundary between Tasks, Chat, and system panels.">
        <div className="overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs text-[color:var(--text-muted)]">
                <th className="py-2 border-b border-[color:var(--line)]">Workspace</th>
                <th className="py-2 border-b border-[color:var(--line)]">Primary Job</th>
                <th className="py-2 border-b border-[color:var(--line)]">Key Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr>
                <td className="py-2 border-b border-[color:var(--line)]"><span className="inline-flex items-center gap-1"><Rocket size={12} /> Tasks</span></td>
                <td className="py-2 border-b border-[color:var(--line)]">Execute tracked tasks end-to-end.</td>
                <td className="py-2 border-b border-[color:var(--line)]">Run, monitor, resume, inspect reports.</td>
              </tr>
              <tr>
                <td className="py-2 border-b border-[color:var(--line)]"><span className="inline-flex items-center gap-1"><Server size={12} /> Chat</span></td>
                <td className="py-2 border-b border-[color:var(--line)]">Explore and iterate conversationally.</td>
                <td className="py-2 border-b border-[color:var(--line)]">Multi-turn Q&A, follow-up guidance.</td>
              </tr>
              <tr>
                <td className="py-2 border-b border-[color:var(--line)]"><span className="inline-flex items-center gap-1"><KeyRound size={12} /> Setup</span></td>
                <td className="py-2 border-b border-[color:var(--line)]">Bootstrap and configure runtime.</td>
                <td className="py-2 border-b border-[color:var(--line)]">Initialize workspace, set provider and API keys.</td>
              </tr>
              <tr>
                <td className="py-2"><span className="inline-flex items-center gap-1"><Wrench size={12} /> Control</span></td>
                <td className="py-2">Govern strategy and platform health.</td>
                <td className="py-2">Review proposals, approvals, MCP status.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Advanced CLI Paths" subtitle="Dashboard now covers first-run and daily operation. Use CLI for automation-heavy workflows.">
        <ul className="text-sm text-[color:var(--text-muted)] space-y-2">
          <li><span className="font-mono">lydia run "..."</span> for scripted terminal execution.</li>
          <li><span className="font-mono">lydia tasks list/show/resume</span> for batch-friendly task operations.</li>
          <li><span className="font-mono">lydia skills install/remove</span> for GitHub/local skill packaging flows.</li>
          <li><span className="font-mono">lydia mcp check</span> for diagnostic checks in CI pipelines.</li>
        </ul>
      </Panel>
    </div>
  );
}

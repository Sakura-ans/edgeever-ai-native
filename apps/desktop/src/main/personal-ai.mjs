import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';

// The SDK owns the agent loop. This module grants only two in-process MCP tools;
// no built-in shell, filesystem, browser, or database tools are registered.
export function createProposalTools(store, mapId, revision) {
  return {
    read_map: async () => {
      const map = store.map(store.snapshot(), mapId, revision);
      return {id:map.id,title:map.title,revision:map.revision,document:map.document};
    },
    propose_map: async ({document,summary}) => store.propose(mapId,revision,document,summary),
  };
}
export function personalAgentEnvironment(config, workingDirectory, source = process.env) {
  // Do not inherit another provider's routing, OAuth tokens, custom auth headers,
  // hooks, or agent settings from a user's shell environment.
  const environment = Object.fromEntries(Object.entries(source).filter(([name]) => /^(PATH|HOME|USERPROFILE|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|TMPDIR|APPDATA|LOCALAPPDATA|LANG|LC_ALL|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS)$/i.test(name)));
  return {...environment,CLAUDE_CONFIG_DIR:workingDirectory,ANTHROPIC_BASE_URL:'https://api.deepseek.com/anthropic',ANTHROPIC_AUTH_TOKEN:config.apiKey,ANTHROPIC_MODEL:config.model,ANTHROPIC_DEFAULT_HAIKU_MODEL:config.model,ANTHROPIC_DEFAULT_SONNET_MODEL:config.model,ANTHROPIC_DEFAULT_OPUS_MODEL:config.model,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
}

export function resolvePersonalAgentExecutable() {
  const require = createRequire(import.meta.url);
  const sdkRequire = createRequire(require.resolve('@anthropic-ai/claude-agent-sdk'));
  const manifest = sdkRequire.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
  return join(dirname(manifest),process.platform === 'win32' ? 'claude.exe' : 'claude').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

export async function runPersonalAgent({store,mapId,revision,prompt,config,onEvent,signal,sdk,workingDirectory}) {
  const {query,tool,createSdkMcpServer} = sdk ?? await import('@anthropic-ai/claude-agent-sdk');
  const {z} = await import('zod');
  const handlers = createProposalTools(store,mapId,revision);
  const result = data => ({content:[{type:'text',text:JSON.stringify(data)}]});
  const server = createSdkMcpServer({name:'mindmap',version:'1.0.0',tools:[
    tool('read_map','Read the current mind map and its revision',{},async () => result(await handlers.read_map())),
    tool('propose_map','Submit a replacement DiagramDocument for human review. Does not save or apply it.',{document:z.record(z.string(),z.unknown()),summary:z.string().max(2000)},async input => {
      const proposal = await handlers.propose_map(input); onEvent({type:'proposal',proposal}); return result({proposalId:proposal.id,status:'pending_user_confirmation'});
    }),
  ]});
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  if (signal?.aborted) cancel();
  const allowed = ['mcp__mindmap__read_map','mcp__mindmap__propose_map'];
  try {
    const messages = (async function* () { yield {type:'user',message:{role:'user',content:prompt},parent_tool_use_id:null,session_id:''}; })();
    const stream = query({prompt:messages,options:{
      cwd:workingDirectory, model:config.model,
      ...(sdk ? {} : {pathToClaudeCodeExecutable:resolvePersonalAgentExecutable()}),
      env:personalAgentEnvironment(config,workingDirectory),
      tools:[], allowedTools:allowed, settingSources:[], skills:[], plugins:[], strictMcpConfig:true, persistSession:false, includePartialMessages:true,
      permissionMode:'default', canUseTool:async (name,input) => allowed.includes(name) ? {behavior:'allow',updatedInput:input} : {behavior:'deny',message:'Only mind map read and proposal tools are permitted'},
      mcpServers:{mindmap:server}, abortController:controller, maxTurns:8,
      systemPrompt:'You help edit a personal mind map. Read it with read_map. Submit changes only with propose_map, preserving a valid DiagramDocument mind-map tree. A proposal is never applied until the user approves in the application. Explain changes concisely. Do not claim that a proposal has been saved.',
    }});
    let partial = false;
    for await (const message of stream) {
      if (message.type === 'stream_event' && message.event?.type === 'content_block_delta' && message.event.delta?.type === 'text_delta') {partial = true; onEvent({type:'text',text:message.event.delta.text});}
      if (message.type === 'assistant') {
        if (!partial) for (const block of message.message.content) if (block.type === 'text') onEvent({type:'text',text:block.text});
        partial = false;
      }
      if (message.type === 'result' && message.is_error) throw new Error('Agent request failed');
    }
  } finally { signal?.removeEventListener('abort',cancel); }
}

// Reserve the request slot before any credential or filesystem await.
export function createPersonalAgentRequests({store,readConfig,makeDirectory,removeDirectory,emit,runAgent=runPersonalAgent}) {
  let active;
  return {
    cancel() { active?.abort(); return true; },
    async ask(input) {
      if (active) throw new Error('An AI request is already running');
      if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 10000) throw new Error('Invalid prompt');
      store.map(store.snapshot(),input.id,input.revision);
      const controller = new AbortController(); active = controller;
      let directory;
      try {
        const config = await readConfig();
        if (!config.apiKey || !config.model) throw new Error('Configure DeepSeek first');
        if (controller.signal.aborted) throw new Error('Cancelled');
        directory = await makeDirectory();
        if (controller.signal.aborted) throw new Error('Cancelled');
        await runAgent({store,mapId:input.id,revision:input.revision,prompt:input.prompt,config,signal:controller.signal,workingDirectory:directory,onEvent:emit});
        return true;
      } catch { throw new Error('AI request failed or cancelled. No automatic map changes were made.'); }
      finally { try { if (directory) await removeDirectory(directory); } finally { active = null; } }
    },
  };
}

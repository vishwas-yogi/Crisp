import { loadConfig } from './config.ts';
import { rewrite } from './rewriter.ts';
import { createLuaRunner } from './lua.ts';
import { showConfirmDialog, notify } from './confirm.ts';
import { startServer } from './server.ts';

async function main() {
  const config = loadConfig();
  const lua = await createLuaRunner();

  const handleRewrite = async (text: string, tone: string): Promise<string> => {
    notify('Crisp', 'Rewriting…');

    const [processedText, resolvedTone] = await lua.onBeforeRewrite(text, '', tone);
    const rewritten = await rewrite(processedText, resolvedTone, config);
    const finalText = await lua.onAfterRewrite(text, rewritten, '');

    if (config.general.mode === 'confirm') {
      const accepted = await showConfirmDialog(text, finalText);
      return accepted ? finalText : text;
    }

    return finalText;
  };

  startServer(config, handleRewrite);

  console.log('');
  console.log('  ✦ Crisp is running');
  console.log(`  server : http://127.0.0.1:8765/rewrite`);
  console.log(`  mode   : ${config.general.mode}`);
  console.log(`  tone   : ${config.general.default_tone}`);
  console.log(`  model  : ${config.model.name} @ ${config.model.ollama_url}`);
  console.log('');
  console.log('  Select text → right-click → Services → Crisp Rewrite');
  console.log('  (or use the keyboard shortcut assigned in System Settings → Keyboard → Services)');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
}

main().catch((err) => {
  console.error('[crisp] Fatal error:', err);
  process.exit(1);
});

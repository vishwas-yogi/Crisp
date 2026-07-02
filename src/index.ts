import { loadConfig } from './config.ts';
import { rewrite } from './rewriter.ts';
import {
  getActiveApp,
  saveClipboard,
  copySelection,
  readClipboard,
  writeClipboard,
  paste,
  restoreClipboard,
  pushUndo,
  sleep,
} from './clipboard.ts';
import { registerHotkeys } from './hotkey.ts';
import { showConfirmDialog, notify } from './confirm.ts';
import { createLuaRunner } from './lua.ts';

async function main() {
  const config = loadConfig();
  const lua = await createLuaRunner();

  let isProcessing = false;

  const handleRewrite = async () => {
    // Prevent concurrent rewrites
    if (isProcessing) return;
    isProcessing = true;

    let savedClipboard = '';

    try {
      const appName = await getActiveApp();
      savedClipboard = await saveClipboard();

      // Copy selected text to clipboard
      await copySelection();
      await sleep(200); // wait for clipboard to update

      const selectedText = await readClipboard();

      // Guard: nothing selected, clipboard unchanged, or selection too short
      if (!selectedText || selectedText === savedClipboard || selectedText.trim().length < 3) {
        return;
      }

      notify('Crisp', 'Rewriting…');

      const [processedText, tone] = await lua.onBeforeRewrite(
        selectedText,
        appName,
        config.general.default_tone,
      );

      const rewritten = await rewrite(processedText, tone, config);
      const finalText = await lua.onAfterRewrite(selectedText, rewritten, appName);

      let accepted = true;
      if (config.general.mode === 'confirm') {
        accepted = await showConfirmDialog(selectedText, finalText);
      }

      if (accepted) {
        pushUndo({ original: selectedText, app: appName, timestamp: Date.now() });
        await writeClipboard(finalText);
        await paste();
        await sleep(200); // let paste complete before restoring clipboard
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[crisp] Rewrite error:', err);
      notify('Crisp Error', msg.slice(0, 120));
    } finally {
      // Always restore the original clipboard, even on error
      await restoreClipboard(savedClipboard).catch(() => {});
      isProcessing = false;
    }
  };

  registerHotkeys(config, () => {
    handleRewrite().catch(console.error);
  });

  console.log('');
  console.log('  ✦ Crisp is running');
  console.log(`  hotkey : ${config.general.hotkey}`);
  console.log(`  mode   : ${config.general.mode}`);
  console.log(`  tone   : ${config.general.default_tone}`);
  console.log(`  model  : ${config.model.name} @ ${config.model.ollama_url}`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
}

main().catch((err) => {
  console.error('[crisp] Fatal error:', err);
  process.exit(1);
});

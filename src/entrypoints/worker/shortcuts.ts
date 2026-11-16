import { reconcileShortcuts } from '../../platform/storage/shortcut-history';
function refresh(): void {
  void reconcileShortcuts().catch(() => undefined);
}
chrome.runtime.onStartup.addListener(refresh);
chrome.runtime.onInstalled.addListener(refresh);
chrome.commands.onCommand.addListener(refresh);
chrome.runtime.onMessage.addListener((message: unknown,sender,respond: (value: unknown) => void) => {
  if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'mods.shortcuts.reconcile') return false;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  void reconcileShortcuts().then(value => {respond({ok:true,value});}).catch(() => {respond({ok:false,error:'Could not save shortcut history. Your local records are retained; check storage access and sync quota.'});});
  return true;
});

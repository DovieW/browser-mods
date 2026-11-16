import { desired, observe, validateRecord, type Assignments, type DeviceRecord } from '../../core/shortcuts/history';
const prefix = 'mods.shortcuts.device.';
let pending: Promise<unknown> = Promise.resolve();
export async function reconcileShortcuts(): Promise<{ actual: Assignments; desired: Assignments; records: DeviceRecord[] }> {
  const task = pending.then(async () => {
    const local = await chrome.storage.local.get(['mods.device', 'mods.shortcuts.local']);
    const device = typeof local['mods.device'] === 'string' ? local['mods.device'] : crypto.randomUUID();
    await chrome.storage.local.set({'mods.device': device});
    const stored = await chrome.storage.sync.get(null);
    const records = Object.entries(stored).filter(([key]) => key.startsWith(prefix)).map(([,value]: [string, unknown]) => value).filter(validateRecord);
    const own: unknown = local['mods.shortcuts.local'];
    const record: DeviceRecord = validateRecord(own) ? own : {device, clock: 0, baseline: {}, revisions: []};
    if (!records.length && !record.revisions.length) {
      const platform = (await chrome.runtime.getPlatformInfo()).os;
      const legacy: unknown = stored[`shortcutSnapshotV1-${platform}`];
      if (legacy && typeof legacy === 'object' && 'bindings' in legacy && legacy.bindings && typeof legacy.bindings === 'object') {
        for (const [command,binding] of Object.entries(legacy.bindings)) {
          if (typeof binding !== 'string' || binding.length > 100 || command.length > 100) continue;
          record.clock++;
          record.revisions.push({id:`${device}:${record.clock}`,device,command,binding,clock:record.clock,observedAt:Date.now()});
        }
      }
    }
    const actual = Object.fromEntries((await chrome.commands.getAll()).filter(c => c.name && !c.name.startsWith('_')).map(c => [c.name ?? '', c.shortcut ?? '']));
    const next = observe(record, actual, [...records, record], Date.now());
    await chrome.storage.local.set({'mods.shortcuts.local': next});
    // Each device owns separate keys. Split by command to respect per-item quota.
    const groups = new Map<string, typeof next.revisions>();
    for (const revision of next.revisions) groups.set(revision.command, [...(groups.get(revision.command) ?? []),revision].slice(-10));
    const writes: Record<string, DeviceRecord> = {};
    for (const [command,revisions] of groups) {
      const shard: DeviceRecord = {device,clock: next.clock,baseline: {},revisions};
      const key = `${prefix}${device}.${command}`;
      if (JSON.stringify(stored[key]) !== JSON.stringify(shard)) writes[key] = shard;
    }
    if (Object.keys(writes).length) {
      const size = new TextEncoder().encode(JSON.stringify({...stored,...writes})).length;
      if (size > 85000) throw Error('Shortcut sync storage is nearly full. Your changes remain saved locally.');
      await chrome.storage.sync.set(writes);
    }
    const merged = [...records.filter(r => r.device !== device),next];
    return {actual,desired: desired(merged),records: merged};
  });
  pending = task.catch(() => undefined);
  return task;
}

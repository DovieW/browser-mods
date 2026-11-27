import { internalCommandId } from "../../core/actions/catalog";

export async function readBrowserCommands(api: typeof chrome.commands) {
  return (await api.getAll()).map((command) =>
    command.name
      ? { ...command, name: internalCommandId(command.name) }
      : command,
  );
}

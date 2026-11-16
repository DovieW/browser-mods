# Dovie's Browser Mods

Read docs/architecture.md and vendor dependency standards before changes. Performance and data preservation come first. Run npm run verify and packaged browser tests for runtime changes. New TypeScript code follows strict rules. Root JS files are exact legacy migration exceptions; do not add new feature code to them. Remove each exception as that subsystem is extracted. Preserve existing command IDs.

import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { commands } from '../src/core/actions/catalog.ts';
await rm('dist',{recursive:true,force:true}); await mkdir('dist');
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
manifest.commands=commands;
for(const file of ['popup.html','popup.css','popup-settings.js','tab-settings.js','PRIVACY.md','offscreen.html','offscreen.js','command-errors.js','logo16.png','logo48.png','logo128.png','LICENSE']) await cp(file,`dist/${file}`);
await cp('node_modules/@doview/mods-shared/design/styles','dist/theme',{recursive:true});
const html=(await readFile('popup.html','utf8')).replace(/  <script src="(?:command-errors|shortcut-ui|shortcut-memory)\.js"><\/script>\n/g,'');
await writeFile('dist/popup.html',html.replace('</body>','<script src="popup-history.js"></script></body>'));
await writeFile('dist/manifest.json',JSON.stringify(manifest,null,2));
await writeFile('dist/options.html',await readFile('src/entrypoints/options/index.html'));
await build({entryPoints:{'shortcut-worker':'src/entrypoints/worker/main.ts','popup-history':'src/entrypoints/popup/history.ts',options:'src/entrypoints/options/main.ts'},outdir:'dist',bundle:true,target:'chrome127',format:'iife',minify:true,metafile:true}).then(r=>writeFile('dist/build-meta.json',JSON.stringify(r.metafile)));

// Legacy scripts share global lexical declarations until converted to typed modules.
const legacy = await Promise.all(['command-errors.js','shortcut-ui.js','shortcut-memory.js','popup.js'].map(file => readFile(file,'utf8')));
await build({stdin:{contents:legacy.join('\n'),resolveDir:process.cwd()},outfile:'dist/popup.js',bundle:false,target:'chrome127',minify:false});

await writeFile('dist/background.js',(await readFile('background.js','utf8'))+'\nimportScripts("shortcut-worker.js");\n');

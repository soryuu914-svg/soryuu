'use strict';
const path=require('node:path');
const {spawnSync}=require('node:child_process');
// Keep downloaded packaging tools on the same drive as release output.
const result=spawnSync(process.execPath,[require.resolve('electron-builder/cli.js'),'--config','electron-builder.cjs','--win','--x64','--publish','never'],{
 cwd:__dirname,stdio:'inherit',env:{...process.env,ELECTRON_BUILDER_CACHE:path.join(__dirname,'release','builder-cache')}
});
if(result.error)throw result.error;
process.exit(result.status??1);

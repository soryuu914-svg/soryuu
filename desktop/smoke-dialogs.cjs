// Deterministic native file choices for the isolated desktop test only.
const fs=require('node:fs'),path=require('node:path');
function createSmokeDialogs(root){
 const dir=path.join(root,'test-artifacts','native-io-'+Date.now());fs.mkdirSync(dir,{recursive:true});let exported,backup;
 const legacy=path.join(dir,'legacy');fs.mkdirSync(legacy);fs.writeFileSync(path.join(legacy,'project.json'),JSON.stringify({id:1,name:'迁移测试作品'}));
 return {
  downloadPath:name=>path.join(dir,path.basename(name)),
  async showSaveDialog(_win,options){const filePath=path.join(dir,path.basename(options.defaultPath));if(options.title.includes('完整写作'))exported=filePath;if(options.title.includes('一致性备份'))backup=filePath;return {canceled:false,filePath};},
  async showOpenDialog(_win,options){return {canceled:false,filePaths:[options.properties.includes('openDirectory')?legacy:options.filters?.[0]?.extensions?.includes('sqlite3')?backup:exported]};},
  async showMessageBox(){return {response:1};}
 };
}
module.exports={createSmokeDialogs};

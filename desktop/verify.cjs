const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=__dirname,out=path.join(root,'protected'),dist=path.join(out,'dist'),html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"?]+)(?:[^"]*)"><\/script>/g)].map(m=>m[1]);
for(const name of scripts){const source=fs.readFileSync(path.join(dist,name),'utf8');new vm.Script(source,{filename:name});assert.ok(!source.includes('sourceMappingURL'),name+' contains map');}
for(const name of ['main.cjs','preload.cjs','storage.cjs','security.cjs','integrity.cjs','ai.cjs'])new vm.Script(fs.readFileSync(path.join(out,name),'utf8'),{filename:name});
require('./integrity.cjs').verifyIntegrity(out);assert.ok(fs.existsSync(path.join(out,'engine.enc')));assert.ok(!fs.readFileSync(path.join(out,'ai.cjs'),'utf8').includes('你是中文小说作者'));
assert.equal(typeof require(path.join(out,'ai.cjs')).createAIService,'function');
const checks=spawnSync(process.execPath,['--test',...fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.cjs')).map(n=>path.join(root,'tests',n))],{encoding:'utf8'});if(checks.status!==0){process.stdout.write(checks.stdout);process.stderr.write(checks.stderr);process.exit(checks.status || 1);}
const result={ok:true,scriptCount:scripts.length,protectedIntegrity:true,encryptedEngineLoads:true,unitTests:checks.stdout.match(/tests (\d+)/)?.[1] || 'see log'};fs.mkdirSync(path.join(root,'test-artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'test-artifacts','verify-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));

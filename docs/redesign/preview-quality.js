/* Shared preview quality policy. Deterministic checks only; no model calls or automatic rewriting. */
window.previewQualityModel = (() => {
  // Explicit metadata can be filtered deterministically. Unlabelled advice remains advisory.
  const materialText = item => [item.summary,...(item.fields || []).filter(([label])=>['规则正文','技巧正文','适用场景与例外','适用场景','不适用场景','例外','原因'].includes(label)).map(([label,value])=>label+'：'+value)].filter(Boolean).join('\n');
  const materialScope = item => new Map(item.fields || []).get('适用场景') || '原资料未标范围；仅按本次任务选择';
  function selectMaterials(items,{operation,genre,scene,text=''}) {
    const split=value=>String(value || '').split(/[、,，;；|]/).map(x=>x.trim()).filter(Boolean);
    const eligible=items.filter(item=>{
      if(item.enabled===false)return false;
      const fields=new Map(item.fields || []), ops=split(fields.get('适用操作')), genres=split(fields.get('适用题材')), scenes=split(fields.get('适用场景类型')), excluded=split(fields.get('排除场景类型'));
      if(ops.length && !ops.includes(operation) && !ops.includes('全部'))return false;
      if(genres.length && !genres.includes(genre) && !genres.includes('通用'))return false;
      if(scenes.length && !scenes.includes('通用') && (!scene || !scenes.includes(scene)))return false;
      return !scene || !excluded.includes(scene);
    });
    // Keyword matches rank candidates only. They do not establish semantic applicability.
    const research=eligible.filter(item=>item.researchSource).map((item,index)=>({item,index,score:(item.matchAny || []).filter(cue=>text.includes(cue)).length})).filter(x=>x.score>0 || x.item.priority>0).sort((a,b)=>b.score-a.score || b.item.priority-a.item.priority || a.index-b.index).slice(0,4).map(x=>x.item);
    return [...eligible.filter(item=>!item.researchSource),...research];
  }
  const policy = operation => {
    if (operation === 'ideas') return '检查整本书主线：主角获得什么能力方向、要做什么。金手指细节留到单独生成。';
    if (operation === 'golden') return '依据核心灵感拓展能力、限制与代价；避免另起主线。';
    if (operation === 'person') return '检查目标与动机、当前状态；所属允许为空，只保留核心资料。';
    if (operation === 'world') return '只保留类别、名称与核心介绍；核对当前世界事实，不扩展无关字段。';
    if (['outline','rewriteVolumes','rewriteChapters','volumeChapters','chapterOutline'].includes(operation)) return '检查因果、目标推进、伏笔及计划；未来章纲不作为已发生事实，不改已保留章节。';
    if (['continue','full','polish','expand'].includes(operation)) return '先检查章节事实和目标，再参考选定文风、技巧与避雷。只局部修订具体问题，保留作者表达。';
    if (operation === 'summary') return '摘要只依据已写正文，检查遗漏与错误，不把未来计划写成事实。';
    if (['tips','techniques'].includes(operation)) return '技巧需有原文依据、适用情境、可执行动作与例外，不作为作者自身文风。';
    if (['rules','mergeRules'].includes(operation)) return '保留标记原因、适用范围与例外；正向技巧和反向规则不互相覆盖，不将常用词一律禁用。';
    if (['passage','bookAnalysis','textAnalysis'].includes(operation)) return '引文须来自提供的样本；片段特点不能直接推为整书结论。';
    if (operation === 'book') return '书名与简介围绕确认的核心灵感，不另造主线。';
    return '先核对输入依据，再检查可定位的问题；语义判断需真实AI和作者审核。';
  };
  const count = text => Array.from(String(text || '').replace(/\s/g,'')).length;
  function check(operation,result,values = {}) {
    const issues = [], text = String(result.summary || ''), words = count(text);
    if (!String(result.title || '').trim()) issues.push({blocking:true,message:'候选标题为空，请补充标题。'});
    if (!text.trim()) issues.push({blocking:true,message:'候选内容为空，请补充内容。'});
    if (values.target) issues.push({blocking:false,message:'实际' + words + '字 / 目标' + values.target + '字。演示结果不保证目标字数，差异由作者判断。'});
    const duplicate = text.split(/\n+/).map(x=>x.trim()).filter(Boolean); if (new Set(duplicate).size < duplicate.length) issues.push({blocking:false,message:'存在完全重复段落，请核对是否需要保留。'});
    issues.push({blocking:false,message:'事实、因果、情绪及个人文风语义尚未由真实AI审核；没有报错不代表内容已通过语义终验。'});
    return issues;
  }
  return {policy,check,materialText,materialScope,selectMaterials};
})();

window.createPreviewQuality = ({onChange}) => {
  const $=id=>document.getElementById(id), node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const input=node('details'); input.id='ai-quality-input'; input.className='ai-context'; // Reference controls are detached: the user removed this panel from the generation UI.
  const report=node('section'); report.id='ai-quality-report'; report.className='ai-quality-report'; report.setAttribute('aria-label','生成检查'); $('ai-adopt-consequence').before(report);
  let operation, context, materials=[], genre='', lastIssues=[],libraryReader,librarySnapshot;
  const selected=()=>materials.filter(item=>item.control.checked).map(({control,...value})=>value);
  const packageInput=()=>({operation,policy:window.previewQualityModel.policy(operation),materials:selected(),instruction:'润色不改变原意和事件，扩写不新增主线事件。正文事实与章纲优先，技巧和避雷不得改变剧情或机械删改常用词。未标明适用范围的资料仅作候选建议，按本章场景判断，不要求全部使用；不确定时略过。遵守每条资料的适用条件与例外，不能为套技巧增加新事件。已选文风为参考，不要求每段达到固定指标。设定事实优先，技巧按情境采用；风格建议不自动改正文。',mode:'preview-only'});
  const renderPackage=()=>{const target=input.querySelector('#ai-quality-package'),value=packageInput();target.textContent='检查重点：'+value.policy+'\n\n'+(value.materials.length ? value.materials.map(item=>item.kind+'：'+item.title+'\n适用范围：'+item.scope+'\n内容：'+item.text).join('\n\n') : '本次没有选择文风、技巧或避雷资料。')+'\n\n使用方式：'+value.instruction+'\n\n当前仅准备输入，未发送真实AI请求。';};
  function open(id,ctx,library) {
    libraryReader=library;librarySnapshot=JSON.stringify(['写作技巧','避雷规则'].map(group=>library(group).items));
    operation=id;context=ctx;materials=[];lastIssues=[];report.replaceChildren();input.replaceChildren(node('summary','本次创作参考与检查'),node('p',window.previewQualityModel.policy(id)));
    const prose=['continue','full','polish','expand'].includes(id), styleGenre=node('select'), genreLabel=node('label','文风参考的题材');styleGenre.id='ai-quality-genre';genreLabel.htmlFor=styleGenre.id;
    const bookGenre=ctx.bookHome?.genre?.split(' · ')[0]; genre=({'仙侠':'修仙','玄幻':'修仙'}[bookGenre] || bookGenre || '其他');
    ['修仙','都市','灵异','科幻','悬疑','其他'].forEach(g=>{const option=node('option',g);option.value=g;styleGenre.append(option);}); if(![...styleGenre.options].some(o=>o.value===genre))genre='其他';styleGenre.value=genre;
    const choices=node('div'); choices.id='ai-quality-choices';
    const drawChoices=()=>{
      choices.replaceChildren();materials=[];
      const styles=prose ? window.previewPracticeController?.styleContext(genre) || [] : [];
      const people=id==='person'?library('人物模板').items.filter(item=>item.destination==='人物模板'):[];
      const eligibility={operation:id,genre,scene:ctx.chapterOutline?.fields?.find(([label])=>label==='场景类型')?.[1],text:JSON.stringify({outline:ctx.chapterOutline,chapter:ctx.writing})};
      const tips=window.previewQualityModel.selectMaterials(library('写作技巧').items.filter(x=>x.title !== '我的文风卡' && (x.readingSource ? window.previewReadingUsage[x.readingSource.dimension]?.operations.includes(id) : prose)),eligibility), rules=prose ? window.previewQualityModel.selectMaterials(library('避雷规则').items,eligibility) : [];
      if(prose && !styles.length) choices.append(node('p','尚无本题材通过验证且审核有效的个人文风。待验证档案不会自动作为生成要求。'));
      const options=[...people.map(x=>({kind:'原书人物参考',title:x.title,text:x.summary+'\n'+x.fields.filter(([label])=>['身份','所属','目标与动机'].includes(label)).map(([label,value])=>label+'：'+value).join('\n'),scope:'来源：'+x.readingSource.bookTitle+' · 仅作人物设计参考，不直接并入本书',source:x.readingSource})),...styles.map(x=>({kind:'文风',title:x.text,text:x.text,scope:x.genre,ruleId:x.ruleId})),...tips.map(x=>({kind:x.readingSource?'拆书参考':'技巧',title:x.title,text:window.previewQualityModel.materialText(x),source:x.readingSource || x.researchSource,scope:x.readingSource?'来源：'+x.readingSource.bookTitle+' · '+window.previewReadingUsage[x.readingSource.dimension].label:window.previewQualityModel.materialScope(x)})),...rules.map(x=>({kind:'避雷',title:x.title,text:window.previewQualityModel.materialText(x),source:x.researchSource,scope:window.previewQualityModel.materialScope(x)}))];
      options.forEach((item,index)=>{const label=node('label');label.className='ai-check';const control=node('input');control.type='checkbox';control.checked=prose;control.id='ai-quality-choice-'+index;label.htmlFor=control.id;label.append(control,node('span',item.kind+' · '+item.title));const description=node('p',item.scope+'\n'+item.text);description.className='ai-quality-material';choices.append(label,description);materials.push({...item,control});control.addEventListener('change',()=>{onChange();report.replaceChildren();renderPackage();});});
      renderPackage();
    };
    const snapshot=node('details');snapshot.append(node('summary','查看准备的生成输入 · 未发送真实AI请求'));const packageText=node('pre');packageText.id='ai-quality-package';snapshot.append(packageText);
    if(prose) input.append(genreLabel,styleGenre); input.append(choices,snapshot); drawChoices();
    styleGenre.addEventListener('change',()=>{genre=styleGenre.value;onChange();report.replaceChildren();drawChoices();});
    if(!prose) choices.append(node('p','此任务以输入条件和故事依据为主，不自动套用个人正文文风。'));
  }
  function review(results,values) {
    report.replaceChildren(node('h4','检查与终验 · 本地预览'),node('p','修改候选后可重新检查；语义审核和按意见自动修订尚未接入真实AI。'));
    lastIssues=results.flatMap(result=>window.previewQualityModel.check(operation,result,values).map(issue=>({...issue,title:result.title})));
    lastIssues.forEach(issue=>report.append(node('p',(issue.blocking?'需补充：':'检查提示：')+issue.title+' · '+issue.message)));
    const retry=node('button','重新检查当前候选');retry.type='button';retry.className='btn'; retry.addEventListener('click',()=>review(results,values));report.append(retry);
    return lastIssues.every(issue=>!issue.blocking);
  }
  function canAdopt(results,values) {
    if(['continue','full','polish','expand'].includes(operation) && JSON.stringify(['写作技巧','避雷规则'].map(group=>libraryReader(group).items))!==librarySnapshot){report.replaceChildren(node('p','写作技巧或避雷规则已修改，请重新打开生成，读取最新内容。'));return false;}
    const current=window.previewPracticeController?.styleContext(genre) || [];
    if(selected().some(item=>item.kind==='文风' && !current.some(x=>x.ruleId===item.ruleId && x.text===item.text && x.genre===item.scope))) { report.replaceChildren(node('p','文风参考已变化，请关闭窗口重新读取，再生成。'));return false; }
    return review(results,values);
  }
  return {open,review,canAdopt,packageInput,clear:()=>report.replaceChildren()};
};

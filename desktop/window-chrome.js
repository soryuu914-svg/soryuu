'use strict';
(()=>{
  const header=document.querySelector('.review');
  if(!header||!window.desktop)return;
  document.documentElement.classList.add('desktop-frame');
  header.classList.add('desktop-titlebar');
  header.querySelector('.review-label').innerHTML='<strong>写作台</strong><span>你的故事，由此展开</span>';
  const setting=header.querySelector('.setting');if(setting)setting.hidden=true;
  const controls=document.createElement('div');controls.className='window-controls';controls.setAttribute('aria-label','窗口操作');
  for(const [action,label] of [['minimize','最小化'],['maximize','放大'],['close','关闭']]){
    const button=document.createElement('button');button.type='button';button.dataset.windowAction=action;button.textContent=label;button.setAttribute('aria-label',label+'窗口');
    button.addEventListener('click',()=>window.desktop.windowAction(action).catch(error=>{console.error(error.message);}));controls.append(button);
  }
  header.append(controls);
  function update(state){document.documentElement.classList.toggle('window-expanded',state.maximized||state.fullscreen);document.documentElement.classList.toggle('window-inactive',!state.focused);const button=controls.querySelector('[data-window-action=maximize]');button.textContent=state.maximized||state.fullscreen?'还原':'放大';button.setAttribute('aria-label',button.textContent+'窗口');}
  window.desktop.onWindowState(update);window.desktop.windowState().then(update);
})();

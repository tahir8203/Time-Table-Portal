/* View preferences only: never change timetable state or printable documents. */
(function(){
  var menuHidden=readPreference('timetable-menu-hidden',false);
  var fit=readPreference('timetable-screen-fit',window.innerWidth>=900);
  var frame=0;
  function readPreference(key,fallback){try{var value=localStorage.getItem(key);return value===null?fallback:value==='true';}catch(e){return fallback;}}
  function savePreference(key,value){try{localStorage.setItem(key,String(value));}catch(e){}}
  function setMenu(){
    document.body.classList.toggle('menu-hidden',menuHidden);
    document.getElementById('sideNav').hidden=menuHidden;
    var button=document.getElementById('sidebarToggle');
    button.setAttribute('aria-expanded',String(!menuHidden));
    button.setAttribute('aria-label',menuHidden?'Show navigation':'Hide navigation');
    button.querySelector('span').textContent=menuHidden?'Show menu':'Hide menu';
  }
  function measure(){
    var pane=document.getElementById('pane'),table=pane.querySelector('table.grid');
    if(!table||!pane.classList.contains('timetable-fit')){pane.dataset.fitReady='true';return;}
    var wrap=table.parentElement;
    // Reserve a small bottom gutter. Do not clip or hide rows if the screen is too small.
    var available=Math.max(80,window.innerHeight-(wrap.getBoundingClientRect().top+window.scrollY)-14);
    function fits(size){
      pane.style.setProperty('--tt-font',size+'px');
      return table.getBoundingClientRect().height<=available && table.scrollWidth<=wrap.clientWidth+1 &&
        Array.from(table.querySelectorAll('td,th')).every(function(c){return c.scrollWidth<=c.clientWidth+1&&c.scrollHeight<=c.clientHeight+1;});
    }
    var lo=8,hi=16;
    if(fits(lo)){
      for(var i=0;i<11;i++){var mid=(lo+hi)/2;if(fits(mid))lo=mid;else hi=mid;}
    }
    var size=Math.floor(lo*10)/10,ok=fits(size);
    pane.dataset.fitReady='true';pane.dataset.fits=String(ok);
    var count=table.tBodies[0].rows.length,kind=window.VIEW==='grid'?'classes':'teachers';
    document.getElementById('fitStatus').textContent=ok?'All '+count+' '+kind+' · fits this screen':
      'More room needed — hide menu or use Full size';
  }
  function update(){
    var pane=document.getElementById('pane'),isGrid=window.VIEW==='grid'||window.VIEW==='tw';
    pane.dataset.view=window.VIEW;
    pane.classList.toggle('timetable-fit',isGrid&&fit);
    pane.dataset.fitReady='false';
    if(!isGrid||!fit){pane.style.removeProperty('--tt-font');delete pane.dataset.fits;}
    var button=document.getElementById('timetableFit');
    button.hidden=!isGrid;button.setAttribute('aria-pressed',String(isGrid&&fit));
    button.textContent=fit?'Full size':'Fit to screen';
    button.title=fit?'Return to larger text with scrolling':'Show the whole timetable in the available screen';
    document.getElementById('fitStatus').textContent=isGrid&&!fit?'Full-size view':'';
    cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);
  }
  document.getElementById('sidebarToggle').onclick=function(){menuHidden=!menuHidden;savePreference('timetable-menu-hidden',menuHidden);setMenu();update();};
  document.getElementById('timetableFit').onclick=function(){fit=!fit;savePreference('timetable-screen-fit',fit);window.scrollTo(0,0);update();};
  window.addEventListener('resize',update);
  if(document.fonts)document.fonts.ready.then(update);
  window.ScreenLayout={update:update};
  setMenu();update();
})();

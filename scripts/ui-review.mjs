import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4173');
 await page.waitForFunction(()=>typeof buildSeed==='function');
 await page.evaluate(()=>{window.CloudPortal={requiresSignIn:()=>false};S=buildSeed();});
 const issues=[];
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:1000});
  for(const view of ['dash','grid','tw','per','cover','gen','setup','time','print','help']){
   await page.evaluate(v=>{VIEW=v;render();},view);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   if(overflow)issues.push({width,view});
  }
  await page.evaluate(()=>{VIEW='dash';render();});
  await page.screenshot({path:`tmp/ui-${width}.png`,fullPage:true});
 }
 console.log(JSON.stringify({overflowIssues:issues}));
 if(issues.length)process.exitCode=1;
}finally{await browser.close();}

import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4173');
 const results=await page.evaluate(()=>{
  S=buildSeed();CDATE='2026-09-23';CMONTH='2026-08';VIEW='cover';render();
  const c=ensureCoverCredits(S),m=S.teachers.find(t=>t.name==='MISS MARIA'),n=S.teachers.find(t=>t.name==='MISS NURGUS');
  const r={imports15:Object.keys(c.history['2026']).length===15,maria13:c.history['2026'][m.id].amount===13,dailyDefault:dailyCoverCredit(n.id,CDATE)===1};
  const before=JSON.stringify(c);ensureCoverCredits(S);r.idempotent=before===JSON.stringify(c);
  S.cover['2026-09-22']={'test|1':m.id};S.cover['2026-09-24']={'test|1':m.id};
  r.noDoubleCount=coverCreditBreakdown(m.id,'all','2026-09-24').total===14;
  r.noFutureCount=coverCreditBreakdown(m.id,'all','2026-09-23').total===13;
  S.leave['2026-09-24']=[n.id];r.leaveSkipsDaily=dailyCoverCredit(n.id,'2026-09-24')===0;
  r.weekendSkipsDaily=dailyCoverCredit(n.id,'2026-09-26')===0;
  c.rewards['2026-08']={[m.id]:6};r.rewardIncluded=coverCreditBreakdown(m.id,'all','2026-09-24').total===20;
  c.rewards['2026-09']={[m.id]:6};r.rewardNotEarly=coverCreditBreakdown(m.id,'all','2026-09-24').total===20;
  r.rewardNextMonth=coverCreditBreakdown(m.id,'all','2026-10-01').total===26;
  r.yearIsolated=coverCreditBreakdown(m.id,'all','2027-01-01').total===0;
  render();document.getElementById('rewardEdit').click();document.getElementById('rewardSave').click();
  r.rewardReplacement=Object.keys(c.rewards['2026-08']).length===1;
  r.rawRecordsUnchanged=S.cover['2026-09-22']['test|1']===m.id;
  return r;
 });console.log(results);if(Object.values(results).some(v=>!v))throw Error('Credit QA failed');
}finally{await browser.close();}

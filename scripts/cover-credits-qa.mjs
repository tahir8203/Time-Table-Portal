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
  r.saturdaySkipsDaily=dailyCoverCredit(n.id,'2026-09-26')===0;
  r.sundaySkipsDaily=dailyCoverCredit(n.id,'2026-09-27')===0;
  const friday=coverCreditBreakdown(n.id,'all','2026-09-25').daily;
  r.weekendTotalsUnchanged=coverCreditBreakdown(n.id,'all','2026-09-26').daily===friday&&coverCreditBreakdown(n.id,'all','2026-09-27').daily===friday;
  r.mondayResumes=coverCreditBreakdown(n.id,'all','2026-09-28').daily===friday+1;
  c.daily[n.id]={amount:3,start:'2026-01-01'};
  let weekends=0,weekdays=0;
  for(let date=new Date(2026,0,1,12);date.getFullYear()===2026;date.setDate(date.getDate()+1)){
    const iso='2026-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
    if([0,6].includes(date.getDay())){weekends++;if(dailyCoverCredit(n.id,iso)!==0)throw Error('Weekend credit on '+iso);}
    else if(!leaveOf(iso).includes(n.id))weekdays++;
  }
  r.all104WeekendDaysExcluded=weekends===104;
  r.manualCreditTotalsWeekdaysOnly=coverCreditBreakdown(n.id,'all','2026-12-31').daily===weekdays*3;
  c.rewards={'2026-08':{[m.id]:6},'2026-09':{[m.id]:6}};
  r.legacyRewardsIgnored=coverCreditBreakdown(m.id,'all','2026-10-01').total===14;
  r.yearIsolated=coverCreditBreakdown(m.id,'all','2027-01-01').total===0;
  render();r.rewardControlsRemoved=!document.getElementById('rewardEdit')&&!document.getElementById('pane').textContent.includes('Month-end attendance');
  r.rawRecordsUnchanged=S.cover['2026-09-22']['test|1']===m.id;
  return r;
 });console.log(results);if(Object.values(results).some(v=>!v))throw Error('Credit QA failed');
}finally{await browser.close();}

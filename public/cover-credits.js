/* Fairness credits are separate from actual cover and leave records. */
function creditToday(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function ensureCoverCredits(st){
  st.coverCredits=st.coverCredits||{history:{},daily:{},version:2};
  var c=st.coverCredits;c.history=c.history||{};c.daily=c.daily||{};
  // Legacy reward records remain recoverable, but never contribute to scores.
  c.version=2;
  if(!c.defaultsApplied){
    st.teachers.forEach(function(t){
      if(['MISS NURGUS','MISS SHAZIA','SIR MANZOOR'].indexOf(t.name.trim().replace(/\s+/g,' ').toUpperCase())>=0&&!c.daily[t.id])
        c.daily[t.id]={amount:1,start:'2026-09-23'};
    });
    c.defaultsApplied=true;
  }
  if(!c.history2026Imported){
    var totals={'MISS MARIA':13,'SIR ARSHAD':8,'SIR ARSHID':8,'SIR ADREES':4,'MISS SHABANA':4,'SIR MANZOOR':17,'SIR RIZWAN':3,'SIR FAROOQ':11,'MISS NURGUS':12,'SIR SALEH':10,'MISS NAZIA':14,'MISS SHAMIM':14,'SIR WAJAHAT':17,'MISS SHAZIA':26,'SIR KHADIM':16,'SIR SALMAN':15};
    c.history['2026']=c.history['2026']||{};
    if(st.meta&&st.meta.school&&/53\/2/.test(st.meta.school))st.teachers.forEach(function(t){var name=t.name.trim().replace(/\s+/g,' ').toUpperCase();if(totals[name]!==undefined&&!c.history['2026'][t.id])c.history['2026'][t.id]={amount:totals[name],through:'2026-09-23'};});
    c.history2026Imported=true;
  }
  return c;
}
function dailyCoverCredit(tid,iso){
  var c=ensureCoverCredits(S).daily[tid];
  return c&&iso>=c.start&&dayCode(iso)&&leaveOf(iso).indexOf(tid)<0?Number(c.amount)||0:0;
}
function coverCreditBreakdown(tid,basis,iso){
  var c=ensureCoverCredits(S), year=iso.slice(0,4), start=basis==='month'?iso.slice(0,7)+'-01':year+'-01-01';
  var h=(c.history[year]||{})[tid], out={actual:0,history:0,daily:0,total:0};
  var cutoff=h&&h.through<=iso&&h.through>=start?h.through:'';
  if(cutoff)out.history=h.amount;
  Object.keys(S.cover||{}).forEach(function(d){
    if(d<start||d>iso||d<=cutoff)return;
    Object.values(S.cover[d]).forEach(function(id){if(id===tid)out.actual++;});
  });
  var cursor=new Date(+year,+start.slice(5,7)-1,1,12);
  for(var n=0;n<366;n++){
    var d=cursor.getFullYear()+'-'+pad(cursor.getMonth()+1)+'-'+pad(cursor.getDate());
    if(d>iso)break;
    out.daily+=dailyCoverCredit(tid,d);
    cursor.setDate(cursor.getDate()+1);
  }
  out.total=out.actual+out.history+out.daily;return out;
}
function coverFairnessCounts(basis,iso){var m={};S.teachers.forEach(function(t){m[t.id]=coverCreditBreakdown(t.id,basis,iso).total;});return m;}
function coverCreditCard(){
  var c=ensureCoverCredits(S),year=CDATE.slice(0,4);
  var h='<div class="card"><h2>Cover credits &amp; history <span class="hint">'+year+' fairness score</span></h2><div class="body">'+
    '<p>Automatic assignment prioritises lower scores. Manual selection includes every available teacher regardless of score. Credits count toward fairness; they are not actual alternative periods. Daily credits apply Monday–Friday from the start date, except recorded leave. Adjust start dates to avoid including old holidays.</p>'+
    '<p>Historical totals replace actual cover counts up to the entered date for scoring only. Existing records are preserved. Enter actual extra periods only; daily credits are added separately. Saturdays and Sundays never receive daily credits. Choose the year using the Day date above.</p>'+
    '<button class="btn pri" id="creditEdit">Edit history and daily credits</button></div>'+
    '<div class="tw"><table><thead><tr><th>Teacher</th><th>Historical total</th><th>Actual after cutoff</th><th>Daily credits</th><th>Year score</th><th>Daily credit today</th></tr></thead><tbody>';
  S.teachers.forEach(function(t){var b=coverCreditBreakdown(t.id,'all',CDATE);h+='<tr><td>'+esc(t.name)+'</td>'+[b.history,b.actual,b.daily,b.total,dailyCoverCredit(t.id,CDATE)].map(function(v){return '<td class="num">'+v+'</td>';}).join('')+'</tr>';});
  return h+'</tbody></table></div></div>';
}
function bindCoverCredits(){
  $('creditEdit').onclick=function(){
    var c=ensureCoverCredits(S),year=CDATE.slice(0,4),h='<div class="tw"><table><thead><tr><th>Teacher</th><th>Historical total</th><th>Counted through</th><th>Daily credit</th><th>Daily start</th></tr></thead><tbody>';
    S.teachers.forEach(function(t){var old=(c.history[year]||{})[t.id]||{},daily=c.daily[t.id]||{};h+='<tr data-credit="'+t.id+'"><td>'+esc(t.name)+'</td><td><input aria-label="Historical total" class="ch" type="number" min="0" step="1" value="'+(old.amount||0)+'"></td><td><input aria-label="Counted through" class="cth" type="date" min="'+year+'-01-01" max="'+CDATE+'" value="'+(old.through||CDATE)+'"></td><td><input aria-label="Daily credit" class="cd" type="number" min="0" max="8" step="1" value="'+(daily.amount||0)+'"></td><td><input aria-label="Daily start" class="cds" type="date" value="'+(daily.start||creditToday())+'"></td></tr>';});
    openDlg('History and daily credits',h+'</tbody></table></div><p>Saving replaces these settings, never adds the same history twice. Daily credit settings also apply in future years.</p>','<button class="btn" onclick="closeDlg()">Cancel</button><button class="btn pri" id="creditSave">Save credits</button>');
    $('creditSave').onclick=function(){
      var edits=[],valid=true;
      document.querySelectorAll('[data-credit]').forEach(function(row){var amount=Number(row.querySelector('.ch').value),through=row.querySelector('.cth').value,daily=Number(row.querySelector('.cd').value),start=row.querySelector('.cds').value;
        if(!Number.isInteger(amount)||amount<0||!Number.isInteger(daily)||daily<0||daily>8||!through||through.slice(0,4)!==year||through>CDATE||!start)valid=false;
        edits.push({id:row.dataset.credit,amount:amount,through:through,daily:daily,start:start});});
      if(!valid){toast('Enter valid dates and non-negative whole counts (daily: 0–8).');return;}
      c.history[year]=c.history[year]||{};edits.forEach(function(e){if(e.amount||c.history[year][e.id])c.history[year][e.id]={amount:e.amount,through:e.through};c.daily[e.id]={amount:e.daily,start:e.start};});
      DIRTY=true;closeDlg();render();toast('Cover credits updated');
    };
  };
}

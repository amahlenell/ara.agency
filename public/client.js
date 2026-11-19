(() => {
  const menu = document.querySelector('.mobile-toggle');
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    document.querySelector('.mobile-nav')?.classList.toggle('open', open);
  });
  document.addEventListener('keydown', e => { if(e.key==='Escape'){document.querySelector('.nav-services')?.removeAttribute('open');if(menu?.getAttribute('aria-expanded')==='true')menu.click();} });
  document.addEventListener('click', e => {const dropdown=document.querySelector('.nav-services');if(dropdown&&!dropdown.contains(e.target))dropdown.removeAttribute('open');});
  document.querySelectorAll('[data-hero-view]').forEach(b => b.addEventListener('click', () => {
    document.querySelector('#hero-demo')?.classList.toggle('hero-before', b.dataset.heroView === 'before');
    document.querySelectorAll('[data-hero-view]').forEach(x => {x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});
  }));
  document.querySelectorAll('[data-comparison]').forEach(demo => {
    const range=demo.querySelector('input[type=range]'),output=demo.querySelector('output');
    range.addEventListener('input',()=>{demo.querySelector('.compare-stage').style.setProperty('--split',range.value+'%');output.textContent=range.value+'% redesigned';});
    demo.querySelectorAll('[data-device]').forEach(b=>b.addEventListener('click',()=>{demo.classList.toggle('is-mobile',b.dataset.device==='mobile');demo.querySelectorAll('[data-device]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});}));
  });
  const posts=[
    ['Meet the people behind your glow.','A little introduction to the team that makes every visit feel like you.','Scheduled · Monday'],
    ['A little care goes a long way.','Three simple ways to look after your hair between appointments.','Approved · Tuesday'],
    ['Make a little time for you.','Explore the treatment menu and choose your next moment of calm.','Scheduled · Wednesday'],
    ['The details make the difference.','A look behind the scenes at the small details we prepare before every visit.','Awaiting approval · Thursday'],
    ['A fresh feeling for the weekend.','An invitation to pause, reset and find your next favourite style.','Draft · Friday']
  ];
  document.querySelectorAll('[data-day]').forEach(b=>b.addEventListener('click',()=>{
    const p=posts[Number(b.dataset.day)];document.querySelector('#post-headline').textContent=p[0];document.querySelector('#post-caption').textContent=p[1];document.querySelector('#post-status').textContent=p[2];
    document.querySelectorAll('[data-day]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});
  }));
  const workflows={enquiry:['Enquiry received','Acknowledgement prepared','Lead recorded','Consultation arranged','Reminder prepared','Follow-up scheduled','Review request prepared'],booking:['Booking request received','Availability checked','Customer details recorded','Booking confirmation prepared','Appointment reminder prepared','Review request scheduled','Customer history updated'],content:['Content brief received','Draft prepared','Content queued for review','Client approval requested','Approved post scheduled','Publication simulated','Performance review planned']};
  let timer;const run=document.querySelector('#run-workflow'),reset=document.querySelector('#reset-workflow'),trigger=document.querySelector('#workflow-trigger');
  const steps=[...document.querySelectorAll('.workflow-steps li')];const announce=document.querySelector('#workflow-announcement');
  function resetWorkflow(){clearTimeout(timer);steps.forEach((s,i)=>{s.classList.remove('active','complete');s.querySelector('.step-text').textContent=workflows[trigger.value][i];s.querySelector('.step-state').textContent='Waiting';});run.disabled=false;trigger.disabled=false;announce.textContent='Demo only. No messages are sent and no appointments are booked.';}
  trigger?.addEventListener('change',resetWorkflow);reset?.addEventListener('click',resetWorkflow);
  run?.addEventListener('click',()=>{resetWorkflow();run.disabled=true;trigger.disabled=true;let i=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;function advance(){if(i>0){steps[i-1].classList.remove('active');steps[i-1].classList.add('complete');steps[i-1].querySelector('.step-state').textContent='Demo complete';}if(i===steps.length){run.disabled=false;trigger.disabled=false;announce.textContent='Simulation complete. No real actions were taken.';return;}steps[i].classList.add('active');steps[i].querySelector('.step-state').textContent='Simulating';announce.textContent=workflows[trigger.value][i]+' — simulation';i++;timer=setTimeout(advance,reduced?20:650);}advance();});
  // sample-approval-handler: this only changes the fictional demo state.
  document.querySelector('#approve-post')?.addEventListener('click',()=>{document.querySelector('#post-status').textContent='Approved · Ready for sample scheduling';document.querySelector('#approval-note').textContent='Sample approval recorded in this preview. No real post was published.';});
  document.querySelectorAll('[data-content-mode]').forEach(button=>button.addEventListener('click',()=>{const irregular=button.dataset.contentMode==='irregular';document.querySelectorAll('[data-content-mode]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});document.querySelectorAll('[data-day]').forEach((day,i)=>{day.hidden=irregular&&[1,2,4].includes(i);});document.querySelector('#calendar-mode-note').textContent=irregular?'An illustrative unplanned week: three days have no content prepared.':'A sample week of consistent, on-brand content.';}));
  document.addEventListener('click',event=>{const link=event.target.closest?.('a');if(!link)return;const path=link.getAttribute('href')||'';const conversion=path.startsWith('/work/')?'portfolio_interaction':path.startsWith('/contact')?'quote_click':path.startsWith('https://wa.me/')?'whatsapp_click':null;if(conversion)window.dispatchEvent(new CustomEvent('ara:conversion',{detail:{event:conversion}}));});
  let category='all';const search=document.querySelector('#blog-search');
  function filterBlog(){const term=(search?.value||'').trim().toLowerCase();let count=0;document.querySelectorAll('[data-blog-category]').forEach(card=>{const show=(category==='all'||card.dataset.blogCategory===category)&&card.dataset.blogSearch.includes(term);card.hidden=!show;if(show)count++;});const empty=document.querySelector('#blog-empty');if(empty)empty.hidden=count!==0;const counter=document.querySelector('#blog-count');if(counter)counter.textContent=count+' article'+(count===1?'':'s');}
  search?.addEventListener('input',filterBlog);document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});filterBlog();}));
  document.querySelectorAll('.enquiry-form').forEach(form=>{
    const chosen=new URLSearchParams(location.search).get('service');if(chosen&&form.elements.service&&[...form.elements.service.options].some(o=>o.value===chosen))form.elements.service.value=chosen;
    const started=Date.now();let idempotency=crypto.randomUUID();
    form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const submit=form.querySelector('[type=submit]'),status=form.querySelector('.form-status');submit.disabled=true;status.className='form-status';status.textContent='Sending your enquiry…';const data=Object.fromEntries(new FormData(form));data.kind=form.dataset.kind;data.consent=form.elements.consent.checked;data.started=started;data.idempotency=idempotency;data.source=location.pathname;
      try{const response=await fetch('/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Your enquiry could not be saved. Please try again.');status.className='form-status success';status.textContent=result.mode==='local'?'Development preview: saved on this computer. No emails were sent. Reference '+result.reference+'.':'Your enquiry has been saved. Your reference is '+result.reference+'. '+(result.email==='sent'?'A confirmation email has been sent.':'Keep this reference for your records.');window.dispatchEvent(new CustomEvent('ara:conversion',{detail:{event:form.dataset.kind==='review'?'website_review_submission':'contact_submission',service:data.service}}));form.reset();idempotency=crypto.randomUUID();}
      catch(error){status.className='form-status error';status.textContent=error.message||'Unable to connect. Please try again.';}finally{submit.disabled=false;}
    });
  });
  if(search)filterBlog();
  document.documentElement.dataset.araReady="true";
})();

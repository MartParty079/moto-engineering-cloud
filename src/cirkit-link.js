const CIRKIT_PROJECT_URL='https://app.cirkitdesigner.com/project/5d24a8de-8eaa-48cf-940a-88380b491da6';

function addCirkitProjectLink(){
 const pcbHeading=[...document.querySelectorAll('main .section h2')].find(el=>el.textContent.trim()==='PCB Designer');
 const actions=pcbHeading?.closest('.section')?.querySelector('.actions');
 if(!actions||actions.querySelector('[data-cirkit-project-link]'))return;

 const link=document.createElement('a');
 link.href=CIRKIT_PROJECT_URL;
 link.target='_blank';
 link.rel='noopener noreferrer';
 link.className='secondary';
 link.dataset.cirkitProjectLink='true';
 link.textContent='Open in Cirkit Designer ↗';
 link.setAttribute('aria-label','Open the Moto Mission PCB project in Cirkit Designer');
 Object.assign(link.style,{
  display:'inline-flex',
  alignItems:'center',
  justifyContent:'center',
  textDecoration:'none',
  whiteSpace:'nowrap'
 });
 actions.prepend(link);
}

new MutationObserver(addCirkitProjectLink).observe(document.body,{childList:true,subtree:true});
addCirkitProjectLink();

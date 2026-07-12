function repairAddButtons(){
 document.querySelectorAll('[data-add]').forEach(button=>{
  const table=button.dataset.add;
  if(!table||button.dataset.addRouteFixed)return;
  button.dataset.addRouteFixed='1';
  if(table==='tasks')return;
  button.addEventListener('click',event=>{
   event.stopImmediatePropagation();
   const editButton=document.querySelector(`[data-edit^="${table}:"]`);
   if(typeof window.openForm==='function')window.openForm(table,{});
   else{
    button.dataset.directAdd=table;
    window.dispatchEvent(new CustomEvent('marty-direct-add',{detail:{table}}));
   }
  },true);
 });
}
new MutationObserver(repairAddButtons).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
repairAddButtons();

// Minimal MCP App host fixture: validates the postMessage transport without
// pretending to be ChatGPT Desktop or to reproduce its sandbox policy.
export function hostTestHtml(token: string) {
  return `<!doctype html><html><body style="margin:0"><iframe title="Laminador MCP App" src="/" style="width:100%;height:100dvh;border:0"></iframe><script>
const frame=document.querySelector('iframe');
window.addEventListener('message',async(event)=>{
 if(event.source!==frame.contentWindow)return;
 const request=event.data;if(!request||request.jsonrpc!=='2.0')return;
 const send=(result)=>frame.contentWindow.postMessage({jsonrpc:'2.0',id:request.id,result},location.origin);
 if(request.method==='ui/initialize')send({protocolVersion:'2026-01-26',hostInfo:{name:'Test MCP App Host',version:'1'},hostCapabilities:{serverTools:{},openLinks:{}},hostContext:{theme:'dark',displayMode:'inline',availableDisplayModes:['inline','fullscreen']}});
 else if(request.method==='tools/call'){
  const response=await fetch('/api/tool',{method:'POST',headers:{'Content-Type':'application/json','X-Laminador-Token':'${token}'},body:JSON.stringify({name:request.params.name,arguments:request.params.arguments})});send(await response.json());
 }else if(request.id!==undefined)send({});
});
</script></body></html>`;
}

const NS='http://www.w3.org/2000/svg';
for(const gid in E){const g=document.getElementById(gid);const svg=document.createElementNS(NS,'svg');svg.classList.add('wires');g.prepend(svg);
 const W=g.scrollWidth,H=g.scrollHeight;svg.setAttribute('width',W);svg.setAttribute('height',H);
 svg.innerHTML=`<defs>${['g','m','k'].map(c=>`<marker id="a${gid}${c}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.5L8 5L1 8.5" fill="none" stroke="${c=='k'?'#71A087':'#A9B4A3'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`).join('')}</defs>`;
 const gr=g.getBoundingClientRect();const R=id=>{const r=document.getElementById(id).getBoundingClientRect();return{l:r.left-gr.left,t:r.top-gr.top,r:r.right-gr.left,b:r.bottom-gr.top,cx:(r.left+r.right)/2-gr.left,cy:(r.top+r.bottom)/2-gr.top}};
 for(const [a,b,lab] of E[gid]){const A=R(a),B=R(b);let d,lx,ly,va=0;const key=lab=='k'||lab=='ok';
  const dashed=document.getElementById(a).classList.contains('im')||document.getElementById(b).classList.contains('im');
  if(lab=='not possible'){const y=A.t-28;d=`M${A.cx-20} ${A.t} V${y} H${B.cx} V${B.t}`;lx=(A.cx+B.cx)/2;ly=y-6}
  else if(lab=='re-prompt'){const x=A.r+40;d=`M${A.r} ${A.cy} H${x} V${B.cy} H${B.r}`;lx=x+4;ly=(A.cy+B.cy)/2}
  else if(Math.abs(A.cy-B.cy)<10){d=A.cx<B.cx?`M${A.r} ${A.cy} H${B.l}`:`M${A.l} ${A.cy} H${B.r}`;lx=(A.cx+B.cx)/2;ly=A.cy-8}
  else if(Math.abs(A.cx-B.cx)<10){d=A.cy<B.cy?`M${A.cx} ${A.b} V${B.t}`:`M${A.cx} ${A.t} V${B.b}`;lx=A.cx+8;ly=(A.cy<B.cy?A.b:B.b)+22;va=1}
  else{const down=A.cy<B.cy;const y1=down?A.b:A.t,y2=down?B.t:B.b,my=(y1+y2)/2;d=`M${A.cx} ${y1} V${my} H${B.cx} V${y2}`;lx=(A.cx+B.cx)/2;ly=my-6}
  const p=document.createElementNS(NS,'path');p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke',key?'#71A087':'#C6CFC0');p.setAttribute('stroke-width',key?2:1.5);p.setAttribute('stroke-linejoin','round');
  if(dashed||lab=='feedback'||lab=='not possible'||lab=='re-prompt')p.setAttribute('stroke-dasharray','4 4');p.setAttribute('marker-end',`url(#a${gid}${key?'k':'g'})`);svg.appendChild(p);
  if(lab&&lab!='k'){const t=document.createElementNS(NS,'text');t.textContent=lab;t.setAttribute('x',lx);t.setAttribute('y',ly);t.setAttribute('class','wl'+(lab=='not possible'?' np':''));t.setAttribute('text-anchor',(lab=='re-prompt'||va)?'start':'middle');svg.appendChild(t)}}}

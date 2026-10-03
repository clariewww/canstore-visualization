(() => {
  'use strict';
  const svg = document.querySelector('#flower');
  const details = document.querySelector('#details');
  const shell = document.querySelector('#detail-shell');
  const empty = document.querySelector('#details-empty');
  const pinned = document.querySelector('.pinned-view');
  const tooltip = document.querySelector('#tooltip');
  const closeButton = document.querySelector('#clear');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compactView = matchMedia('(max-width: 800px)');
  const NS = 'http://www.w3.org/2000/svg';
  const cx = 450, cy = 414;
  const ease = 'cubic-bezier(.22,.75,.24,1)';
  const colors = {Discover:'#acd5c5', Direct:'#b7a1b6', Develop:'#dfb592'};
  if (!window.CANSTORE_DATA || !window.CANSTORE_LAYOUT) {
    document.querySelector('#count').textContent = 'The research data could not load. Please reload this page.';
    return;
  }
  const {people, outputs} = window.CANSTORE_DATA;
  const byPerson = new Map(people.map(p => [p.person_id, p]));
  const byOutput = new Map(outputs.map(o => [o.publication_id, o]));
  const direct = window.CANSTORE_DIRECT || {areas:[], workstreams:[], personContext:[], personWorkstreams:[], outputWorkstreams:[]};
  const byWorkstream = new Map(direct.workstreams.map(w => [w.id, w]));
  const byArea = new Map(direct.areas.map(a => [a.id, a]));
  const directPeople = new Map(direct.personContext.filter(p => p.subteam === 'Direct').map(p => [p.person_id, p]));
  const directBrowse = document.querySelector('#direct-browse');
  const backButton = document.querySelector('#detail-back');
  directBrowse.hidden = !byWorkstream.size;
  let selectionHistory = [];
  const expansionStates = new Map();
  function directMemberships(id) {
    return direct.personWorkstreams.filter(m => m.person_id === id && m.status === 'verified' && byWorkstream.has(m.workstream_id));
  }
  function verifiedWorkstreamOutputs(id) {
    return new Set(direct.outputWorkstreams.filter(m => m.workstream_id === id && m.status === 'verified').map(m => m.publication_id));
  }
  function selectionTitle(next) {
    if (next.kind === 'directory') return 'DIRECT workstreams';
    if (next.kind === 'workstream') return byWorkstream.get(next.id).title;
    return next.kind === 'output' ? byOutput.get(next.id).title : byPerson.get(next.id).name;
  }
  const {layoutPeople, layoutOutputs, classifyPIs, contributorCounts, personRadius, outputShape, seedContourRadius, seedOutline} = window.CANSTORE_LAYOUT;
  const positions = layoutPeople(people, {cx, cy});
  const totals = contributorCounts(people, outputs);
  const maximumTotal = Math.max(...totals.values());
  const classifications = new Map(outputs.map(output => [output.publication_id, classifyPIs(output, byPerson)]));
  const categoryLabels = {standard:'Standard output', 'multiple-pi':'Multiple-PI output', 'cross-pi':'Cross-subteam PI output'};
  const flowerLayout = layoutOutputs(outputs, {cx, cy});
  const outputPositions = new Map();
  const seedElements = new Map(), seedArt = new Map(), seedPulse = new Map(), personElements = new Map();
  const branches = new Map(), twigs = new Map(), swayAnimations = new Map();
  const growthAnimations = new Set();
  let year = 1, selection = null, lastTrigger = null;
  let hovering = false, focusing = false;

  function el(tag, attrs, parent = svg) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    parent.append(node);
    return node;
  }
  function text(tag, content, parent, className) {
    const node = document.createElement(tag);
    node.textContent = content;
    if (className) node.className = className;
    parent.append(node);
    return node;
  }
  function point(angle, radius) {
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  }
  function authorTeams(output) {
    return [...new Set(output.author_ids.flatMap(id => (byPerson.get(id)?.subteam || '').split(';').map(t => t.trim())).filter(Boolean))];
  }
  function showTip(event, label) {
    if (selection) return;
    tooltip.textContent = label;
    tooltip.hidden = false;
    const box = document.querySelector('.visual').getBoundingClientRect();
    const target = event.currentTarget.getBoundingClientRect();
    const width = tooltip.getBoundingClientRect().width;
    tooltip.style.left = Math.max(0, Math.min(target.x - box.x, box.width - width)) + 'px';
    tooltip.style.top = Math.max(0, target.y - box.y - tooltip.offsetHeight - 10) + 'px';
  }
  function bind(node, label, next) {
    node.addEventListener('click', () => select(next, node));
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(next, node);
      }
    });
    node.addEventListener('pointerenter', event => { hovering=true; syncMotion(); showTip(event, label); });
    node.addEventListener('focus', event => showTip(event, label));
    node.addEventListener('pointerleave', () => { hovering=false; tooltip.hidden = true; syncMotion(); });
    node.addEventListener('blur', () => { tooltip.hidden = true; });
  }

  const defs = el('defs', {});
  const wash = el('radialGradient', {id:'core-wash'}, defs);
  el('stop', {offset:'0%', 'stop-color':'#d9e8d9', 'stop-opacity':'.72'}, wash);
  el('stop', {offset:'70%', 'stop-color':'#d9e8d9', 'stop-opacity':'.35'}, wash);
  el('stop', {offset:'100%', 'stop-color':'#d9e8d9', 'stop-opacity':'0'}, wash);
  const light = el('radialGradient', {id:'seed-light', cx:'28%', cy:'22%', r:'78%'}, defs);
  el('stop', {offset:'0%', 'stop-color':'#fffef2', 'stop-opacity':'.78'}, light);
  el('stop', {offset:'55%', 'stop-color':'#fffef2', 'stop-opacity':'.08'}, light);
  el('stop', {offset:'100%', 'stop-color':'#315f4f', 'stop-opacity':'.12'}, light);
  const shadow = el('filter', {id:'seed-shadow', x:'-35%', y:'-35%', width:'180%', height:'190%', 'color-interpolation-filters':'sRGB'}, defs);
  el('feDropShadow', {dx:'1.5', dy:'3', stdDeviation:'2.3', 'flood-color':'#315f4f', 'flood-opacity':'.13'}, shadow);
  el('path', {d:`M ${cx+10} ${cy+27} C 556 535 645 690 662 828 L 667 828 C 649 687 563 531 ${cx+15} ${cy+24} Z`, class:'stem', 'aria-hidden':'true'});
  const labelLayer = el('g', {'aria-hidden':'true'});
  const linkLayer = el('g', {'aria-hidden':'true'});
  const twigLayer = el('g', {});
  const core = el('g', {});
  el('ellipse', {cx:cx-3, cy:cy+2, rx:107, ry:103, class:'core-wash'}, core);

  [...people].sort((a,b) => a.name.localeCompare(b.name)).forEach(person => {
    const [x,y] = positions.get(person.person_id);
    const node = el('g', {class:'person', role:'button', tabindex:'0', 'aria-label':`${person.name}, ${person.subteam}, ${totals.get(person.person_id)} recorded outputs across all three years`, 'aria-controls':'detail-shell', 'data-person':person.person_id}, core);
    el('circle', {cx:x, cy:y, r:personRadius(totals.get(person.person_id), maximumTotal), fill:colors[person.subteam] || '#c2d7c9', class:'person-dot'}, node);
    el('circle', {cx:x, cy:y, r:9.5, class:'person-hit'}, node);
    bind(node, `${person.name} · ${person.subteam} · ${totals.get(person.person_id)} outputs across all three years`, {kind:'person', id:person.person_id});
    personElements.set(person.person_id, node);
  });

  flowerLayout.labels.forEach(({scope, count, angle}) => {
    if (count < 4) return;
    const [lx, ly] = point(angle, 395);
    const label = el('text', {x:lx, y:ly, class:'scope-label', 'text-anchor':'middle'}, labelLayer);
    label.textContent = scope.startsWith('Unassigned') ? scope.replace('Unassigned · ', '') + ' · unassigned' : scope;
  });
  document.querySelectorAll('[data-type-symbol]').forEach(symbol => {
    el('path', {d:seedOutline(symbol.getAttribute('data-type-symbol'), 10)}, symbol);
  });
  outputs.forEach(output => {
    const shape = outputShape(output.type);
    const id = output.publication_id, phase = Number(id) * 2.399963;
    const {x, y, angle:a, radius:seedRadius, scope, controlAngle} = flowerLayout.positions.get(id);
    const [sx, sy] = point(a, 101);
    const [mx, my] = point(controlAngle, 180 + Math.sin(phase) * 10);
    outputPositions.set(id, [x, y]);
    // Decorative depth is independent of output type, year and collaboration.
    const depth = .5 + .5 * Math.sin(phase);
    const twig = el('g', {class:'twig', 'data-twig':id, 'data-depth':depth > .55 ? 'front' : 'back'}, twigLayer);
    twig.style.transformOrigin = `${sx}px ${sy}px`;
    const path = el('path', {d:`M${sx},${sy} Q${mx},${my} ${x},${y}`, class:'branch', 'pointer-events':'none', 'stroke-width':.7 + Number(id) % 4 * .1}, twig);
    path.style.transformOrigin = `${sx}px ${sy}px`;
    const pi = classifications.get(id), label = pi.unknown ? 'PI involvement unknown' : categoryLabels[pi.category];
    const node = el('g', {class:`seed ${pi.category}`, role:'button', tabindex:'0', transform:`translate(${x} ${y})`, 'aria-label':`${output.title}, ${output.type || "Output type unrecorded"}, year ${output.year}, ${label}`, 'aria-controls':'detail-shell', 'data-output':id, 'data-pi-category':pi.category, 'data-output-shape':shape}, twig);
    const art = el('g', {class:'seed-art'}, node);
    el('circle', {r:seedRadius+5, class:'selection-ring'}, art);
    const pulse = el('g', {class:'seed-pulse'}, art);
    seedPulse.set(id, pulse);
    el('path', {d:seedOutline(shape, seedRadius), class:'halo'}, pulse);
    el('path', {d:seedOutline(shape, seedRadius - .8), class:'seed-light', 'aria-hidden':'true'}, pulse);
    for (let j=0; j<10; j++) {
      const theta = j * Math.PI / 5 + Math.sin(phase) * .18;
      const contourRadius = seedContourRadius(shape, seedRadius, theta);
      const tx = Math.cos(theta) * contourRadius, ty = Math.sin(theta) * contourRadius;
      el('path', {d:`M${Math.cos(theta)*4},${Math.sin(theta)*4} L${tx},${ty}`, class:'filament'}, pulse);
      el('circle', {cx:tx, cy:ty, r:1.15, class:'seed-tip'}, pulse);
    }
    if (pi.category === 'cross-pi') {
      el('path', {d:'M0,-6 L6,0 L0,6 L-6,0 Z', class:'pi-diamond'}, pulse);
    } else if (pi.category === 'multiple-pi') {
      el('circle', {r:5, class:'pi-inner'}, pulse);
      el('circle', {cx:-2.1, r:1.35, class:'seed-heart'}, pulse);
      el('circle', {cx:2.1, r:1.35, class:'seed-heart'}, pulse);
    } else {
      el('circle', {r:2.2, class:'seed-heart'}, pulse);
    }
    el('circle', {r:seedRadius+3, fill:'transparent'}, node);
    bind(node, `${output.short_title||output.title} · ${output.type || "Output type unrecorded"} · Year ${output.year} · ${label} · ${scope}`, {kind:'output',id});
    branches.set(id,path); seedElements.set(id,node); seedArt.set(id,art); twigs.set(id,twig);
  });

  // Sway is a decorative transform around fixed anchors; the data coordinates never move.
  function createSway() {
    swayAnimations.forEach(animations => animations.forEach(animation => animation.cancel()));
    swayAnimations.clear();
    if (reducedMotion.matches) return;
    outputs.forEach(output => {
      const id=output.publication_id, n=Number(id);
      const angle=flowerLayout.positions.get(id).angle;
      const depth=.5+.5*Math.sin(n*2.399963);
      const amplitude=1.05+depth*.65;
      // A shared breeze passes around the flower, with a smaller returning gust.
      // Fixed anchors and neutral first frames keep selected authorship lines aligned.
      const duration=7200;
      const animation=twigs.get(id).animate([
        {transform:'rotate(0deg)'},
        {transform:`rotate(${amplitude}deg)`},
        {transform:`rotate(${amplitude*.25}deg)`,offset:.52},
        {transform:`rotate(${-amplitude*.7}deg)`,offset:.8},
        {transform:'rotate(0deg)'}
      ], {duration, iterations:Infinity, easing:'cubic-bezier(.45,0,.55,1)'});
      animation.pause();
      animation.currentTime = ((angle+Math.PI)*380 + depth*250)%duration;
      const unfurl=seedPulse.get(id).animate([
        {transform:'rotate(0deg) scale(1)'},
        {transform:`rotate(7deg) scale(${1.025+depth*.02}, .96)`,offset:.38},
        {transform:'rotate(-5deg) scale(.975, 1.025)',offset:.76},
        {transform:'rotate(0deg) scale(1)'}
      ], {duration:5100+n%5*420, iterations:Infinity, easing:'cubic-bezier(.45,0,.55,1)'});
      unfurl.pause();
      unfurl.currentTime=(n*379)%(5100+n%5*420);
      swayAnimations.set(id,[animation,unfurl]);
    });
    syncMotion();
  }
  function syncMotion() {
    const paused = hovering || focusing || !!selection || reducedMotion.matches || document.hidden;
    outputs.forEach(output => {
      const animations=swayAnimations.get(output.publication_id);
      if (!animations) return;
      animations.forEach(animation => {
        if (paused || output.year>year) animation.pause(); else animation.play();
        if (selection || reducedMotion.matches) animation.currentTime=0;
      });
    });
    growthAnimations.forEach(animation => paused ? animation.pause() : animation.play());
  }
  function cancelGrowth() {
    growthAnimations.forEach(animation => animation.cancel());
    growthAnimations.clear();
  }
  function animateGrowth(newOutputs) {
    if (reducedMotion.matches || selection) return;
    newOutputs.forEach((output,i) => {
      const branch=branches.get(output.publication_id), art=seedArt.get(output.publication_id);
      const branchAnimation=branch.animate([
        {transform:'scale(.05)',opacity:0},
        {transform:'scale(1)',opacity:twigs.get(output.publication_id).getAttribute('data-depth') === 'front' ? .64 : .34}
      ],{duration:1250,delay:i*25,fill:'backwards',easing:ease});
      const seedAnimation=art.animate([
        {transform:'translateY(8px) rotate(-48deg) scale(.05, .2)',opacity:0},
        {transform:'translateY(-2px) rotate(8deg) scale(1.06, .96)',opacity:.9,offset:.72},
        {transform:'rotate(0deg) scale(1)',opacity:1}
      ],{duration:1200,delay:300+i*25,fill:'backwards',easing:ease});
      [branchAnimation,seedAnimation].forEach(animation => {
        growthAnimations.add(animation);
        animation.onfinish=()=>growthAnimations.delete(animation);
      });
    });
    syncMotion();
  }
  svg.addEventListener('pointerleave',()=>{hovering=false;syncMotion();});
  svg.addEventListener('focusin',()=>{focusing=true;syncMotion();});
  svg.addEventListener('focusout',event=>{if(!svg.contains(event.relatedTarget)){focusing=false;syncMotion();}});
  document.addEventListener('visibilitychange',syncMotion);
  reducedMotion.addEventListener('change',()=>{cancelGrowth();createSway();syncMotion();});

  function recordButton(label, parent, next) {
    const button=text('button',label,parent,'record-link');
    button.type='button';
    button.setAttribute('data-open-kind', next.kind);
    button.setAttribute('data-open-id', next.id);
    button.addEventListener('click',()=>select(next,null,false));
    return button;
  }
  function metadata(parent, entries) {
    const list=document.createElement('dl'); list.className='record-meta'; parent.append(list);
    entries.forEach(([label,value])=>{const pair=document.createElement('div');list.append(pair);text('dt',label,pair);text('dd',value||'Not recorded',pair);});
  }
  function updateScrollHint() {
    document.querySelector('#details-scroll-hint').hidden = !selection || !(details.scrollHeight - details.scrollTop > details.clientHeight + 8);
  }
  details.addEventListener('scroll', updateScrollHint, {passive:true});
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateScrollHint).observe(details);

  function configureExpansion(element, key, initiallyOpen=false) {
    if(expansionStates.has(key)?expansionStates.get(key):initiallyOpen)element.setAttribute('open','');
    element.addEventListener('toggle',()=>{
      if(!element.isConnected)return;
      expansionStates.set(key,element.getAttribute('open')!==null);
      updateScrollHint();
    });
  }
  function sourceNote(parent, slides) {
    text('p', `DIRECT team presentation · June 2025 · Slides ${[...new Set(slides)].sort((a,b)=>a-b).join(', ')}`, parent, 'context-source');
  }
  function workstreamList(parent, streams) {
    const list=text('ul','',parent,'workstream-list');
    streams.forEach(stream => recordButton(stream.title,text('li','',list),{kind:'workstream',id:stream.id}));
  }
  function renderDirectContext(person, parent) {
    if(person.subteam !== 'Direct') return;
    const context=directPeople.get(person.person_id), memberships=directMemberships(person.person_id);
    if(!context || !memberships.length) return;
    const section=text('section','',parent,'direct-context');
    text('h3','Research involvement · June 2025',section,'list-heading');
    if(context.role)text('p',`${context.role} in the presentation`,section,'context-role');
    const streams=memberships.map(m=>byWorkstream.get(m.workstream_id));
    const areaNames=direct.areas.filter(a=>streams.some(w=>w.area===a.id)).map(a=>a.title);
    text('p',context.summary || `Listed in ${streams.length} workstream${streams.length===1?'':'s'} across ${areaNames.join(' and ')}.`,section,'record-note');
    const expansion=text('details','',section,'context-expansion');
    configureExpansion(expansion,`person:${person.person_id}`,streams.length<=3);
    text('summary',`View ${streams.length} workstream${streams.length===1?'':'s'}`,expansion);
    direct.areas.forEach(area=>{
      const group=streams.filter(w=>w.area===area.id);
      if(!group.length)return;
      text('h4',area.title,expansion,'area-label');
      workstreamList(expansion,group);
    });
    sourceNote(section,[...memberships.map(m=>m.slide),...(context.role?[context.roleSlide]:[])]);
  }
  function renderWorkstreamDetails(chosen) {
    if(selection.kind==='directory'){
      text('p','Explore DIRECT’s research activities in the June 2025 team presentation. Open an area to see its workstreams.',details,'context-intro');
      const catalogue=text('div','',details,'workstream-catalogue');
      direct.areas.forEach(area=>{
        const expansion=text('details','',catalogue,'area-expansion');
        configureExpansion(expansion,`area:${area.id}`);
        text('summary',area.title,expansion);
        text('p',area.description,expansion,'record-note');
        workstreamList(expansion,direct.workstreams.filter(w=>w.area===area.id));
        sourceNote(expansion,area.slides);
      });
      return;
    }
    const stream=byWorkstream.get(selection.id), area=byArea.get(stream.area);
    text('p',`${area.title} · June 2025`,details,'context-eyebrow');
    const body=text('div','',details,'record-body');
    const facts=text('div','',body,'record-facts'), related=text('div','',body,'record-related');
    text('h3','Area of work',facts,'list-heading');
    text('p',area.description,facts,'record-note');
    if(stream.description)text('p',stream.description,facts,'record-note');
    text('p','Outlines show DIRECT workstream participation as of June 2025. This snapshot stays the same as you explore project years.',facts,'record-note');
    sourceNote(facts,[...area.slides,stream.slide]);
    text('h3',`Verified related outputs through Year ${year}`,facts,'list-heading context-output-heading');
    if(!chosen.length)text('p','No publication-to-workstream links are verified for this view. This does not mean the workstream has no outputs.',facts,'record-note');
    else{
      const list=text('ul','',facts,'output-list');
      chosen.forEach(output=>recordButton(output.title,text('li','',list),{kind:'output',id:output.publication_id}));
    }
    const ids=stream.person_ids.filter(id=>directPeople.has(id));
    text('h3',`Matched DIRECT participants (${ids.length})`,related,'list-heading');
    if(stream.partial)text('p','Partial roster: additional slide references need identity confirmation or fall outside the DIRECT roster.',related,'record-note roster-note');
    const list=text('ul','',related,'workstream-roster');
    ids.forEach(id=>{
      const person=directPeople.get(id),li=text('li','',list);
      if(byPerson.get(id)?.subteam==='Direct')recordButton(person.name,li,{kind:'person',id});
      else{text('span',person.name,li,'roster-name');text('small','Presentation participant · no authored outputs in the current dataset',li,'roster-status');}
    });
  }

  function updateDetails(chosen) {
    shell.hidden=!selection; empty.hidden=!!selection;
    pinned.classList.toggle('has-selection',!!selection);
    svg.classList.toggle('has-selection',!!selection && selection.kind !== 'directory');
    backButton.hidden = !selectionHistory.length;
    if(!selection){details.replaceChildren();return;}
    details.replaceChildren(); details.scrollTop=0;
    document.querySelector('#detail-kind').textContent={output:'Research output',person:'Contributor',workstream:'DIRECT workstream',directory:'DIRECT research'}[selection.kind];
    const heading=text('h2',selectionTitle(selection),details);
    heading.id='detail-title'; heading.tabIndex=-1;
    if(selection.kind==='workstream'||selection.kind==='directory'){renderWorkstreamDetails(chosen);return;}
    const item=selection.kind==='output'?chosen[0]:byPerson.get(selection.id);
    if(selection.kind==='person' && item.subteam==='Direct')text('p','DIRECT',details,'context-eyebrow');
    const body=document.createElement('div');body.className='record-body';details.append(body);
    const facts=document.createElement('div'), related=document.createElement('div');
    facts.className='record-facts'; related.className='record-related'; body.append(facts,related);
    if(selection.kind==='output'){
      metadata(facts,[['Project year',`Year ${item.year}`],['Output type',item.type],['Research scope',item.scope||'Unassigned'],['Status',item.status]]);
      if(item.venue)text('p',item.venue,facts,'record-note');
      if(item.doi){
        const href=item.doi.startsWith('http')?item.doi:'https://doi.org/'+item.doi;
        try{const url=new URL(href);if(['https:','http:'].includes(url.protocol)){
          const link=text('a','View publication',facts,'publication-link');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';text('span','↗',link).setAttribute('aria-hidden','true');
        }}catch{}
      }
      const pi = classifications.get(item.publication_id);
      text('p', pi.unknown ? 'PI involvement unknown' : categoryLabels[pi.category], related, 'pi-status ' + pi.category);
      if (!pi.unknown) text('p', `${pi.count} recorded PI author${pi.count === 1 ? '' : 's'}${pi.teams.length ? ' · ' + pi.teams.join(' + ') : ''}`, related, 'record-note pi-summary');
      const represented=authorTeams(item), hasAuthors=item.author_ids.length>0;
      const status=!hasAuthors?'All-author collaboration unknown':represented.length>1?`All-author collaboration · ${represented.join(' + ')}`:'All-author collaboration · '+represented.join('');
      text('p',status,related,'collaboration-status'+(represented.length>1?' is-cross':''));
      if(!hasAuthors){text('p','Contributors are not recorded for this output in the source data.',related,'record-note');}
      else{
        text('h3',`${item.author_ids.length} recorded contributor${item.author_ids.length===1?'':'s'}`,related,'list-heading');
        const list=text('ul','',related,'contributor-list');
        item.author_ids.forEach(id=>{const p=byPerson.get(id),li=text('li','',list);recordButton(p.name,li,{kind:'person',id});text('span',`${p.subteam}${String(p.is_pi).toLowerCase()==='true'?' · PI':''}`,li,'team-tag');});
      }
    }else{
      renderDirectContext(item,facts);
      metadata(facts,[['Subteam',item.subteam],[item.subteam==='Direct'?'Status in source data':'Current status',String(item.active).toLowerCase()==='true'?'Active':'Inactive in source data'],['Role',String(item.is_pi).toLowerCase()==='true'?'Principal investigator':'Contributor'],['Outputs',`${chosen.length} through year ${year}`],['Node size',`${totals.get(item.person_id)} outputs across all three years`]]);
      if(String(item.active).toLowerCase()!=='true')text('p','Earlier contributions remain part of this research history.',facts,'record-note');
      text('h3',item.subteam==='Direct'?`Authored outputs through Year ${year}`:`Research through year ${year}`,related,'list-heading');
      if(!chosen.length)text('p','No outputs are recorded for this person by this year. Scroll forward to explore their later work.',related,'record-note');
      const list=text('ul','',related,'output-list');
      chosen.forEach(output=>{const li=text('li','',list);recordButton(output.title,li,{kind:'output',id:output.publication_id});text('span',`Year ${output.year} · ${output.type}`,li,'output-year');});
    }
  }
  function select(next, trigger, toggle=true, remember=true) {
    if(trigger){lastTrigger=trigger;selectionHistory=[];}
    else if(remember && selection && (selection.kind!==next.kind || selection.id!==next.id))selectionHistory.push({...selection});
    cancelGrowth();
    selection=toggle&&selection&&selection.kind===next.kind&&selection.id===next.id?null:next;
    syncMotion(); render();
    if(!selection)selectionHistory=[];
    const message=selection?`Selected ${selectionTitle(selection)}. Details are below the flower.`:'Selection cleared.';
    document.querySelector('#selection-announcement').textContent=message;
    if(selection){
      if(!reducedMotion.matches)shell.animate([{opacity:.4,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:450,easing:ease});
      if(!trigger)document.querySelector('#detail-title').focus({preventScroll:true});
    }
  }
  function clearSelection(restoreFocus=true) {
    selection=null;selectionHistory=[];render();syncMotion();
    document.querySelector('#selection-announcement').textContent='Selection cleared.';
    if(restoreFocus&&lastTrigger?.isConnected&&lastTrigger.getClientRects().length)lastTrigger.focus({preventScroll:true});
  }
  function render() {
    tooltip.hidden=true;
    const visible=outputs.filter(o=>o.year<=year);
    selectionHistory=selectionHistory.filter(s=>s.kind!=='output'||visible.some(o=>o.publication_id===s.id));
    if(selection?.kind==='output'&&!visible.some(o=>o.publication_id===selection.id)){selection=null;selectionHistory=[];}
    const linked=selection?.kind==='workstream'?verifiedWorkstreamOutputs(selection.id):new Set();
    const chosen=selection?visible.filter(o=>selection.kind==='output'?o.publication_id===selection.id:selection.kind==='person'?o.author_ids.includes(selection.id):selection.kind==='workstream'?linked.has(o.publication_id):false):[];
    const isWorkstream=selection?.kind==='workstream';
    const highlight=!!selection && selection.kind!=='directory';
    const activeOutputs=new Set(chosen.map(o=>o.publication_id));
    const activePeople=new Set(isWorkstream?byWorkstream.get(selection.id).person_ids.filter(id=>byPerson.get(id)?.subteam==='Direct'):chosen.flatMap(o=>o.author_ids));
    if(selection?.kind==='person')activePeople.add(selection.id);
    outputs.forEach(output=>{
      const id=output.publication_id,node=seedElements.get(id),twig=twigs.get(id),path=branches.get(id);
      twig.style.display=output.year<=year?'':'none';
      node.classList.toggle('dim',highlight&&!activeOutputs.has(id));
      node.classList.toggle('selected',activeOutputs.has(id));
      node.setAttribute('aria-pressed',String(selection?.kind==='output'&&selection.id===id));
      path.classList.toggle('dim',highlight);
    });
    personElements.forEach((node,id)=>{
      node.classList.toggle('dim',highlight&&!activePeople.has(id));
      node.classList.toggle('selected',!isWorkstream&&activePeople.has(id));
      node.classList.toggle('workstream-member',isWorkstream&&activePeople.has(id));
      node.setAttribute('aria-pressed',String(selection?.kind==='person'&&selection.id===id));
    });
    linkLayer.replaceChildren();
    if(!isWorkstream)chosen.forEach(output=>output.author_ids.forEach(id=>{
      const [x,y]=positions.get(id),[tx,ty]=outputPositions.get(output.publication_id);
      el('path',{d:`M${x},${y} Q${cx},${cy} ${tx},${ty}`,class:'author-link'},linkLayer);
    }));
    document.querySelector('#count').textContent=`${visible.length} outputs · ${new Set(visible.flatMap(o=>o.author_ids)).size} contributors · through year ${year}`;
    svg.dataset.year=year;
    document.querySelectorAll('[data-chapter]').forEach(chapter=>chapter.classList.toggle('active',Number(chapter.dataset.chapter)===year));
    updateDetails(chosen);updateScrollHint();syncMotion();
  }
  function setYear(next) {
    if(next===year)return;
    cancelGrowth();
    const previous=year;year=next;render();
    if(next>previous)animateGrowth(outputs.filter(o=>o.year>previous&&o.year<=next));
  }

  // Observe chapter crossings rather than doing layout reads on every scroll event.
  let chapterObserver;
  const chapters=[...document.querySelectorAll('[data-chapter]')];
  function followChapters() {
    const line=innerHeight*(compactView.matches ? .76 : .55);
    let active=1;
    chapters.forEach(chapter=>{if(chapter.getBoundingClientRect().top<=line)active=Number(chapter.dataset.chapter);});
    setYear(active);
  }
  function observeChapters() {
    chapterObserver?.disconnect();
    const line=innerHeight*(compactView.matches ? .76 : .55);
    chapterObserver=new IntersectionObserver(followChapters,{rootMargin:`0px 0px -${Math.max(0,innerHeight-line)}px 0px`,threshold:[0,1]});
    chapters.forEach(chapter=>chapterObserver.observe(chapter));
    followChapters();
  }
  directBrowse.addEventListener('click',()=>select({kind:'directory',id:'direct'},directBrowse));
  backButton.addEventListener('click',()=>{
    const previous=selectionHistory.pop();
    if(previous)select(previous,null,false,false);
  });
  closeButton.addEventListener('click',()=>clearSelection());
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&selection)clearSelection();});
  addEventListener('resize',observeChapters);
  addEventListener('pageshow',followChapters);
  render(); createSway(); observeChapters();
  animateGrowth(outputs.filter(output=>output.year<=year));
})();

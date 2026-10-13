(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CANSTORE_SCOPES = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  // User-approved provisional display groups. Original scope fields stay intact.
  // Topic grouping does not establish a publication-to-workstream association.
  const groups = [
    {label:'Energy systems & governance', shortLabel:'Energy & governance', ids:['47','48','49','51','52','56','57','59','66']},
    {label:'Community engagement & rights', shortLabel:'Community & rights', ids:['53','55','60','62','63']},
    {label:'Carbon conversion & CCUS', shortLabel:'Carbon conversion & CCUS', ids:['50','65']},
    {label:'Transdisciplinary & place-based research', shortLabel:'Research approaches', ids:['54','64']},
    {label:'Needs review', shortLabel:'DIRECT · needs review', ids:['58','61'], needsReview:true},
  ];
  const byId = new Map(groups.flatMap(group => group.ids.map(id => [id, group])));

  function getScopeInfo(output) {
    const originalScope = String(output.scope || '').trim();
    const isDirect = String(output.subteam || '').split(';').some(team => team.trim() === 'Direct');
    const group = !originalScope && isDirect ? byId.get(String(output.publication_id)) : null;
    if (group) return {label:group.label, shortLabel:group.shortLabel, provisional:true,
      needsReview:!!group.needsReview, originalScope};
    const label = originalScope || `Unassigned · ${String(output.subteam || '').replaceAll(';', ' + ')}`;
    return {label, shortLabel:label, provisional:false, needsReview:false, originalScope};
  }

  return {getScopeInfo};
});

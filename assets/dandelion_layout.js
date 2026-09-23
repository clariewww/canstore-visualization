(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CANSTORE_LAYOUT = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  function seededRandom(seed) {
    return function () {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function compareIds(a, b) {
    return String(a.person_id).localeCompare(String(b.person_id), 'en', {numeric: true});
  }

  /**
   * Pack the complete contributor dataset once, independently of time selection.
   * The irregular boundary and blue-noise starting points are decorative only;
   * anchors have enough clearance for the bounded, output-count-based radii.
   */
  function layoutPeople(people, {cx = 416, cy = 355, radius = 90, minSpacing = 20} = {}) {
    if (!Array.isArray(people)) throw new TypeError('Expected an array of people.');
    if (![cx, cy, radius, minSpacing].every(Number.isFinite) || radius <= 0 || minSpacing <= 0) {
      throw new RangeError('Layout dimensions must be finite, with positive radius and spacing.');
    }
    const ordered = [...people].sort(compareIds);
    if (new Set(ordered.map(person => person.person_id)).size !== ordered.length) {
      throw new Error('Person IDs must be unique.');
    }
    if (!ordered.length) return new Map();
    if (ordered.length === 1) return new Map([[ordered[0].person_id, [cx, cy]]]);

    const random = seededRandom(0xCA5702E);
    const boundary = angle => radius * (0.95 + 0.035 * Math.sin(3 * angle + 0.8) + 0.015 * Math.sin(5 * angle - 1.5));
    function constrain(point) {
      const distance = Math.hypot(point[0], point[1]);
      const limit = boundary(Math.atan2(point[1], point[0]));
      if (distance > limit) {
        point[0] *= limit / distance;
        point[1] *= limit / distance;
      }
    }

    // Best-candidate sampling avoids an obvious grid, spiral, or ring pattern.
    const points = [[-radius * 0.11, radius * 0.045]];
    for (let i = 1; i < ordered.length; i++) {
      let best = null, bestDistance = -1;
      for (let attempt = 0; attempt < 240; attempt++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * boundary(angle);
        const candidate = [Math.cos(angle) * distance, Math.sin(angle) * distance];
        let nearest = Infinity;
        for (const point of points) {
          nearest = Math.min(nearest, (point[0] - candidate[0]) ** 2 + (point[1] - candidate[1]) ** 2);
        }
        if (nearest > bestDistance) { bestDistance = nearest; best = candidate; }
      }
      points.push(best);
    }

    // Resolve spacing before rendering; this is not a running force simulation.
    const target = minSpacing + 0.3;
    for (let pass = 0; pass < 2400; pass++) {
      let maximumOverlap = 0;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i], b = points[j];
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const distance = Math.hypot(dx, dy);
          if (distance >= target) continue;
          const overlap = target - distance;
          maximumOverlap = Math.max(maximumOverlap, overlap);
          const adjustment = overlap / Math.max(distance, 0.001) * 0.51;
          a[0] -= dx * adjustment; a[1] -= dy * adjustment;
          b[0] += dx * adjustment; b[1] += dy * adjustment;
          constrain(a); constrain(b);
        }
      }
      if (maximumOverlap < 0.001) break;
    }

    let closest = Infinity;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        closest = Math.min(closest, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
      }
    }
    if (closest < minSpacing - 0.001) {
      throw new RangeError('The contributor core is too dense. Increase its radius or reduce the minimum spacing.');
    }

    // A diagonal sweep gives subteams loose neighboring regions, without rings.
    // Ordering within each team uses IDs, so source CSV row order cannot move a person.
    const teamOrder = ['Discover', 'Direct', 'Develop'];
    const grouped = [...ordered].sort((a, b) => {
      const ai = teamOrder.indexOf(a.subteam), bi = teamOrder.indexOf(b.subteam);
      return (ai < 0 ? teamOrder.length : ai) - (bi < 0 ? teamOrder.length : bi) ||
        String(a.subteam || '').localeCompare(String(b.subteam || ''), 'en') || compareIds(a, b);
    });
    points.sort((a, b) => (a[0] * 0.76 + a[1] * 0.65) - (b[0] * 0.76 + b[1] * 0.65));
    return new Map(grouped.map((person, index) => [person.person_id, [cx + points[index][0], cy + points[index][1]]]));
  }

  // This classification uses recorded PI authors, never an output's assigned team.
  function classifyPIs(output, byPerson) {
    const authors = [...new Set(output.author_ids)];
    const pis = authors.map(id => byPerson.get(id)).filter(person =>
      person && String(person.is_pi).trim().toLowerCase() === 'true');
    const teams = [...new Set(pis.flatMap(person => String(person.subteam || '')
      .split(';').map(team => team.trim()).filter(Boolean)))].sort();
    return {category: pis.length < 2 ? 'standard' : teams.length > 1 ? 'cross-pi' : 'multiple-pi',
      count: pis.length, teams, unknown: authors.length === 0};
  }

  function contributorCounts(people, outputs) {
    const counts = new Map(people.map(person => [person.person_id, 0]));
    outputs.forEach(output => [...new Set(output.author_ids)].forEach(id => {
      if (counts.has(id)) counts.set(id, counts.get(id) + 1);
    }));
    return counts;
  }

  function personRadius(count, maximum) {
    // Bounded radius, with area increasing linearly with recorded output count.
    return Math.sqrt(5.8 ** 2 + Math.max(0, Math.min(count / Math.max(1, maximum), 1)) * (9 ** 2 - 5.8 ** 2));
  }

  function layoutOutputs(outputs, {cx = 450, cy = 414} = {}) {
    const groups = new Map();
    [...outputs].sort((a, b) => Number(a.publication_id) - Number(b.publication_id)).forEach(output => {
      const key = output.scope || `Unassigned · ${output.subteam.replaceAll(';', ' + ')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(output);
    });
    const points = [], labels = [], gap = .055;
    const random = seededRandom(0xCA5708);
    const sweep = Math.PI * 2 - gap * groups.size;
    let angle = -Math.PI * .94;
    for (const [scope, items] of groups) {
      items.sort((a, b) => a.year - b.year || Number(a.publication_id) - Number(b.publication_id));
      const span = items.length / outputs.length * sweep;
      labels.push({scope, count: items.length, angle: angle + span / 2});
      items.forEach((output, i) => {
        const id = output.publication_id;
        const anchor = angle + span * (i + .5) / items.length;
        // Continuous, seeded variation avoids repeating radial tiers. Full-period
        // coordinates are computed once, so time changes never rearrange seeds.
        const a = anchor + (random() - .5) * .085;
        const radius = Math.sqrt(185 ** 2 + random() * (347 ** 2 - 185 ** 2));
        points.push({id, scope, anchor, radius: 18 + Number(id) * 7 % 11,
          x: Math.cos(a) * radius, y: Math.sin(a) * radius});
      });
      angle += span + gap;
    }
    // A compact, slightly asymmetric envelope with room between seed heads.
    // Relax only overlaps, retaining irregular pockets rather than equal spacing.
    for (let pass = 0; pass < 1200; pass++) {
      let overlap = 0;
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j], dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy), minimum = a.radius + b.radius + 9;
        if (distance >= minimum) continue;
        overlap = Math.max(overlap, minimum - distance);
        const shift = (minimum - distance) / Math.max(.001, distance) * .51;
        a.x -= dx * shift; a.y -= dy * shift; b.x += dx * shift; b.y += dy * shift;
      }
      points.forEach(point => {
        const rawAngle = Math.atan2(point.y, point.x);
        const difference = Math.atan2(Math.sin(rawAngle - point.anchor), Math.cos(rawAngle - point.anchor));
        const a = point.anchor + Math.max(-.18, Math.min(.18, difference));
        const outerRadius = 352 + 10 * Math.sin(3 * a + .8) + 8 * Math.cos(2 * a);
        const radius = Math.max(174, Math.min(outerRadius, Math.hypot(point.x, point.y)));
        point.x = Math.cos(a) * radius; point.y = Math.sin(a) * radius;
      });
      if (overlap < .001) break;
    }
    return {positions: new Map(points.map(point => [point.id, {
      x: cx + point.x, y: cy + point.y, angle: Math.atan2(point.y, point.x),
      radius: point.radius, scope: point.scope, controlAngle: Math.atan2(point.y, point.x) + Math.sin(Number(point.id) * 2.399963) * .13 - .025
    }])), labels};
  }

  function outputShape(type) {
    const normalized = String(type || '').trim().toLowerCase();
    return normalized === 'journal' ? 'journal' : normalized === 'conference' ? 'conference' : 'other';
  }

  // Shared contours keep the legend, filaments and interactive seed artwork aligned.
  // Every silhouette fits the existing radius, preserving spacing and hit targets.
  function seedContourRadius(shape, radius, angle) {
    if (shape === 'conference') return radius * (.96 + .04 * Math.cos(8 * (angle + Math.PI / 2)));
    return radius;
  }

  function seedOutline(shape, radius) {
    const samples = 160;
    return Array.from({length:samples}, (_, index) => {
      const angle = index * Math.PI * 2 / samples - Math.PI / 2;
      const r = seedContourRadius(shape, radius, angle);
      return `${index ? 'L' : 'M'}${(Math.cos(angle)*r).toFixed(3)},${(Math.sin(angle)*r).toFixed(3)}`;
    }).join(' ') + ' Z';
  }

  return {layoutPeople, layoutOutputs, classifyPIs, contributorCounts, personRadius, outputShape, seedContourRadius, seedOutline};
});

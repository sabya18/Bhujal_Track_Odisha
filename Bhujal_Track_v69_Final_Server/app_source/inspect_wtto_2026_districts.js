const wtto = require('./src/data/wtto_preloaded.json');

const getDistrict = (sheet) => {
  if (!sheet) return 'Other';
  const s = sheet.toLowerCase().trim();
  if (s.includes('kendrapara') || s.includes('kdp')) {
    return s.includes('urban') ? 'Kendrapara Urban' : 'Kendrapara';
  }
  if (s.includes('cuttack')) {
    return s.includes('urban') ? 'Cuttack Urban' : 'Cuttack';
  }
  if (s.includes('jajpur')) {
    return s.includes('urban') ? 'Jajpur Urban' : 'Jajpur';
  }
  if (s.includes('jspur') || s.includes('jagatsinghpur')) return 'Jagatsinghpur';
  const clean = s.replace('_blocks', '').replace('_urban', '');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const dist2026 = {};
wtto.forEach(w => {
  const dist = getDistrict(w.sheet);
  if (w.history) {
    Object.keys(w.history).forEach(k => {
      if (k.startsWith('2026')) {
        if (!dist2026[dist]) dist2026[dist] = {};
        dist2026[dist][k] = (dist2026[dist][k] || 0) + 1;
      }
    });
  }
});

console.log('Districts with 2026 records in wtto_preloaded.json:', dist2026);

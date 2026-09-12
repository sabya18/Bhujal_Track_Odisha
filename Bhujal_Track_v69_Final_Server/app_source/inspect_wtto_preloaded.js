const preloaded = require('./src/data/wtto_preloaded.json');

const districts = new Set();
const years = new Set();

preloaded.forEach(w => {
  if (w.sheet) {
    districts.add(w.sheet);
  }
  if (w.history) {
    Object.keys(w.history).forEach(k => {
      const year = k.split('_')[0];
      years.add(year);
    });
  }
});

console.log("Preloaded WTTO districts (sheets):", Array.from(districts));
console.log("Preloaded WTTO years:", Array.from(years).sort());

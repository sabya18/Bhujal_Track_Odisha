const wells = require('./src/data/wells.json');
console.log('First 5 wells in wells.json:');
for (let i = 0; i < Math.min(5, wells.length); i++) {
  console.log(JSON.stringify(wells[i], null, 2));
}

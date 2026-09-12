const wells = require('./src/data/wells.json');

const dateCounts = {};
wells.forEach(w => {
  if (w.date) {
    const yr = w.date.split('.').pop();
    dateCounts[yr] = (dateCounts[yr] || 0) + 1;
    if (yr === '2026') {
      console.log(`Well ${w.well_number}: date=${w.date}, dtgwl_mbgl=${w.dtgwl_mbgl}, dtgwl_bmp=${w.dtgwl_bmp}`);
    }
  }
});

console.log('Date year counts in wells.json:', dateCounts);

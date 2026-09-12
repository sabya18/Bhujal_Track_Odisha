const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const wbPath = "c:\\Users\\dassa\\OneDrive\\Documents\\gwapi\\GWRA REPORT_2025_ODISHA_FINAL.xlsx";
try {
  const workbook = XLSX.readFile(wbPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet);
  
  const gwraData = {};

  rawData.forEach(row => {
    const slNo = row['Dynamic Ground Water Resources of Odisha, 2025'];
    const district = row['__EMPTY'];
    const block = row['__EMPTY_1'];
    const aquifer = row['__EMPTY_2'];
    const yieldVal = row['__EMPTY_3'];
    const rifVal = row['__EMPTY_4'];
    
    if (slNo && !isNaN(slNo) && district && block) {
      const distName = district.trim().toUpperCase();
      const blockName = block.trim().toUpperCase();
      
      const normBlock = blockName.replace(/[^A-Z]/g, '');
      
      gwraData[normBlock] = {
        district: distName,
        block: block.trim(),
        aquifer: aquifer ? aquifer.trim() : 'N/A',
        specificYield: yieldVal !== undefined ? parseFloat(yieldVal) : 0,
        rainfallInfiltrationFactor: rifVal !== undefined ? parseFloat(rifVal) : 0
      };
    }
  });

  const outputPath = path.join(__dirname, 'src', 'data', 'gwra_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(gwraData, null, 2));
  console.log(`Successfully parsed ${Object.keys(gwraData).length} blocks and saved to ${outputPath}`);
} catch (e) {
  console.error("Error:", e);
}

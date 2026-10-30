require('reflect-metadata');const fs=require('fs');
const {ExpenseReceiptParserService}=require('../dist/modules/expenses/expense-receipt-parser.service.js');
(async()=>{const buf=fs.readFileSync(process.argv[2]);const r=await new ExpenseReceiptParserService().scan(buf,'image/jpeg');
console.log('cropped',r.cropped,r.ocrLanguages,r.warnings);console.log(r.rawText);console.log(JSON.stringify(r.fields,null,1));
fs.writeFileSync('/tmp/real_scan.jpg',r.scanImage);process.exit(0)})();

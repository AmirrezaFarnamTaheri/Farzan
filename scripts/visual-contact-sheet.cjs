const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve('artifacts/visual-audit');
async function make(group) {
  const dir=path.join(root,'screenshots',group);
  if(!fs.existsSync(dir))return;
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.png')).sort();
  if(!files.length)return;
  const cols=group==='functional'?4:5,w=310,h=246;
  const composite=[];
  for(let i=0;i<files.length;i++){
    const thumb=await sharp(path.join(dir,files[i])).resize({width:286,height:210,fit:'contain',background:'#101820'}).png().toBuffer();
    const label=files[i].replace(/\.png$/,'').replace(/[<>&"']/g,'');
    const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="26"><text x="7" y="18" font-family="Arial" font-size="13" fill="#263a50">'+label+'</text></svg>');
    const x=(i%cols)*w+14,y=Math.floor(i/cols)*h+10;
    composite.push({input:thumb,left:x,top:y},{input:svg,left:x,top:y+211});
  }
  const target=path.join(root,'contact-sheet-'+group+'.png');
  await sharp({create:{width:cols*w+22,height:Math.ceil(files.length/cols)*h+24,channels:3,background:'#f1f5f8'}}).composite(composite).png().toFile(target);
  console.log('[visual-audit] sheet',group,'screenshots',files.length,'=>',target);
}
(async()=>{for(const name of ['desktop','tablet','mobile','light-desktop','light-mobile','standalone','functional'])await make(name);})().catch(e=>{console.error(e);process.exitCode=1});

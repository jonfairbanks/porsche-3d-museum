#!/usr/bin/env node

/**
 * Converts the legacy Base64 archive-photo bundle into ordinary local image
 * files. Keeping the exact decoded bytes removes JavaScript parsing and Base64
 * expansion from first paint without changing the displayed photographs.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const legacyPath=path.join(repositoryRoot,'assets','archive-photos.js');
const outputRoot=path.join(repositoryRoot,'assets','media','runtime');
const source=readFileSync(legacyPath,'utf8');
const assignment='window.PORSCHE_MEDIA_DATA=';
if(!source.startsWith(assignment))throw new Error('Legacy photo bundle is not a PORSCHE_MEDIA_DATA assignment.');
const photos=JSON.parse(source.slice(assignment.length).replace(/;\s*$/,''));
mkdirSync(outputRoot,{recursive:true});
let written=0;
const expectedFiles=new Set(),extensionForMime={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};
for(const [relativeUrl,dataUrl] of Object.entries(photos)){
  const match=dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!match)throw new Error(`${relativeUrl} is not a Base64 data URL.`);
  const extension=extensionForMime[match[1]];
  if(!extension)throw new Error(`${relativeUrl} uses unsupported ${match[1]}.`);
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.toString('base64')!==match[2])throw new Error(`${relativeUrl} has non-canonical Base64.`);
  const filename=path.basename(relativeUrl).replace(/\.[^.]+$/,extension);
  expectedFiles.add(filename);
  const destination=path.join(outputRoot,filename);
  writeFileSync(destination,bytes);
  written+=bytes.length;
}
for(const entry of readdirSync(outputRoot,{withFileTypes:true}))if(entry.isFile()&&!expectedFiles.has(entry.name))rmSync(path.join(outputRoot,entry.name));
console.log(`Extracted ${Object.keys(photos).length} archive photos (${written} bytes) to assets/media/runtime/.`);

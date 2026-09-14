#!/usr/bin/env node

/**
 * Losslessly packages embedded GLB Base64 payloads as raw .glb and deterministic
 * gzip level-6 .glb.gz files. It never rewrites GLB JSON or binary chunks.
 *
 * Commands:
 *   node scripts/extract-glbs.mjs --source work/source-bundles
 *   node scripts/extract-glbs.mjs --verify
 *   node scripts/extract-glbs.mjs --verify --source work/source-bundles
 *   node scripts/extract-glbs.mjs --report
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const modelsRoot = path.join(repositoryRoot, 'models');
const manifestPath = path.join(modelsRoot, 'GLB-MANIFEST.json');
const args = process.argv.slice(2);
let verifyOnly = false;
let reportOnly = false;
let sourceArgument = null;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--verify') verifyOnly = true;
  else if (argument === '--report') reportOnly = true;
  else if (argument === '--source' && args[index + 1]) sourceArgument = args[++index];
  else throw new Error('Usage: node scripts/extract-glbs.mjs [--verify|--report] [--source DIRECTORY]');
}
if (verifyOnly && reportOnly) throw new Error('--verify and --report are separate read-only commands.');

const sourceRoot = sourceArgument ? path.resolve(repositoryRoot, sourceArgument) : modelsRoot;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function relative(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function listModelSources(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listModelSources(entryPath);
      return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
    })
    .sort();
}

function decodeSource(sourcePath) {
  const text = readFileSync(sourcePath, 'utf8');
  const match = text.match(/^\s*(?:window\.)?([A-Za-z_$][\w$]*)\s*=\s*(["'])([A-Za-z0-9+/=\s]+)\2\s*;?\s*$/s);
  if (!match) throw new Error(`${relative(sourcePath)} is not one Base64 assignment.`);
  const base64 = match[3].replace(/\s/g, '');
  const decoded = Buffer.from(base64, 'base64');
  if (decoded.toString('base64') !== base64) throw new Error(`${relative(sourcePath)} contains non-canonical Base64.`);
  validateGlb(decoded, sourcePath);
  return { assignment: match[1], decoded, sourceBytes: Buffer.byteLength(text) };
}

function validateGlb(bytes, sourcePath) {
  const label = relative(sourcePath);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${label} does not contain a GLB v2 file.`);
  if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`${label} has an invalid GLB header or declared length.`);
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error(`${label} has a truncated GLB chunk header.`);
    const length = bytes.readUInt32LE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataOffset = offset + 8;
    const end = dataOffset + length;
    if (length % 4 !== 0 || end > bytes.length) throw new Error(`${label} has an invalid ${type} chunk.`);
    chunks.push({ type, length, dataOffset, end });
    offset = end;
  }
  if (!chunks.length || chunks[0].type !== 'JSON') throw new Error(`${label} has no leading JSON chunk.`);
  const json = JSON.parse(bytes.toString('utf8', chunks[0].dataOffset, chunks[0].end).trimEnd());
  if (json.buffers?.some((buffer) => 'uri' in buffer) || json.images?.some((image) => 'uri' in image)) throw new Error(`${label} references an external buffer or image.`);
  return { chunks, json };
}

function inspectGlb(bytes, sourcePath) {
  const { chunks, json } = validateGlb(bytes, sourcePath);
  const binChunk = chunks.find((chunk) => chunk.type === 'BIN\0');
  const binPaddingBytes = binChunk ? binChunk.length - (json.buffers?.[0]?.byteLength ?? 0) : 0;
  if (binPaddingBytes < 0 || binPaddingBytes > 3) throw new Error(`${relative(sourcePath)} has unexpected BIN padding.`);
  const identicalViews = [];
  if (binChunk && Array.isArray(json.bufferViews)) {
    const groups = new Map();
    json.bufferViews.forEach((view, index) => {
      const offset = view.byteOffset ?? 0;
      const data = bytes.subarray(binChunk.dataOffset + offset, binChunk.dataOffset + offset + view.byteLength);
      const key = `${view.byteLength}:${sha256(data)}`;
      groups.set(key, [...(groups.get(key) ?? []), { index, data }]);
    });
    for (const group of groups.values()) if (group.length > 1 && group.slice(1).every((item) => item.data.equals(group[0].data))) identicalViews.push(group.map((item) => item.index));
  }
  return { chunkCount: chunks.length, bufferViews: json.bufferViews?.length ?? 0, accessors: json.accessors?.length ?? 0, meshes: json.meshes?.length ?? 0, images: json.images?.length ?? 0, binPaddingBytes, identicalBufferViewGroups: identicalViews };
}

function readManifest() {
  if (!existsSync(manifestPath)) throw new Error(`${relative(manifestPath)} is missing.`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.models) || !manifest.models.length) throw new Error(`${relative(manifestPath)} has no model records.`);
  return manifest;
}

function glbPathForSource(sourcePath) {
  const modelRelativePath = path.relative(sourceRoot, sourcePath);
  if (modelRelativePath.startsWith('..') || path.isAbsolute(modelRelativePath)) throw new Error(`${relative(sourcePath)} is outside --source.`);
  return path.join(modelsRoot, modelRelativePath.replace(/\.js$/, '.glb'));
}

function verifyManifest(manifest, compareSource) {
  for (const record of manifest.models) {
    const glbPath = path.resolve(repositoryRoot, record.glb);
    const gzipPath = path.resolve(repositoryRoot, record.gzip);
    if (!existsSync(glbPath)) throw new Error(`${record.glb} is missing.`);
    if (!existsSync(gzipPath)) throw new Error(`${record.gzip} is missing.`);
    const glb = readFileSync(glbPath);
    const gzip = readFileSync(gzipPath);
    validateGlb(glb, glbPath);
    if (sha256(glb) !== record.sha256) throw new Error(`${record.glb} does not match the manifest SHA-256.`);
    if (sha256(gzip) !== record.gzipSha256) throw new Error(`${record.gzip} does not match the manifest SHA-256.`);
    if (!gunzipSync(gzip).equals(glb)) throw new Error(`${record.gzip} does not decompress exactly to ${record.glb}.`);
    if (compareSource) {
      const sourcePath = path.join(sourceRoot, path.relative(modelsRoot, glbPath).replace(/\.glb$/, '.js'));
      if (!existsSync(sourcePath)) throw new Error(`${relative(sourcePath)} is missing.`);
      if (!decodeSource(sourcePath).decoded.equals(glb)) throw new Error(`${record.glb} does not exactly match ${relative(sourcePath)}.`);
    }
  }
  console.log(`Verified ${manifest.models.length} GLBs and deterministic gzip packages against ${relative(manifestPath)}.`);
}

if (verifyOnly) {
  verifyManifest(readManifest(), Boolean(sourceArgument));
  process.exit(0);
}

if (reportOnly) {
  const manifest = readManifest();
  const report = manifest.models.map((record) => {
    const glbPath = path.resolve(repositoryRoot, record.glb);
    const glb = readFileSync(glbPath);
    return { source: record.source, glb: record.glb, bytes: glb.length, sha256: sha256(glb), ...inspectGlb(glb, glbPath) };
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const sourceFiles = listModelSources(sourceRoot);
if (!sourceFiles.length) throw new Error(`No source bundles found below ${relative(sourceRoot)}. Pass --source work/source-bundles to regenerate.`);
const records = sourceFiles.map((sourcePath) => {
  const { assignment, decoded, sourceBytes } = decodeSource(sourcePath);
  const glbPath = glbPathForSource(sourcePath);
  const gzipPath = `${glbPath}.gz`;
  const gzip = gzipSync(decoded, { level: 6, mtime: 0 });
  writeFileSync(glbPath, decoded);
  writeFileSync(gzipPath, gzip);
  return { source: relative(sourcePath), glb: relative(glbPath), gzip: relative(gzipPath), global: assignment, sourceBytes, glbBytes: decoded.length, gzipLevel6Bytes: gzip.length, byteReduction: sourceBytes - decoded.length, reductionPercent: Number((((sourceBytes - decoded.length) / sourceBytes) * 100).toFixed(2)), sha256: sha256(decoded), gzipSha256: sha256(gzip) };
});
const totals = records.reduce((total, record) => ({ sourceBytes: total.sourceBytes + record.sourceBytes, glbBytes: total.glbBytes + record.glbBytes, gzipLevel6Bytes: total.gzipLevel6Bytes + record.gzipLevel6Bytes }), { sourceBytes: 0, glbBytes: 0, gzipLevel6Bytes: 0 });
const manifest = { generatedBy: 'scripts/extract-glbs.mjs', sourceRoot: relative(sourceRoot), modelCount: records.length, totals: { ...totals, byteReduction: totals.sourceBytes - totals.glbBytes, reductionPercent: Number((((totals.sourceBytes - totals.glbBytes) / totals.sourceBytes) * 100).toFixed(2)), gzipLevel6ByteReduction: totals.glbBytes - totals.gzipLevel6Bytes, gzipLevel6ReductionPercent: Number((((totals.glbBytes - totals.gzipLevel6Bytes) / totals.glbBytes) * 100).toFixed(2)) }, models: records };
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
verifyManifest(manifest, true);
console.log(`Packaged ${records.length} GLBs: ${totals.sourceBytes} Base64-JS bytes -> ${totals.glbBytes} GLB bytes -> ${totals.gzipLevel6Bytes} gzip-6 bytes.`);

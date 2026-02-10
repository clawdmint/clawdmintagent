#!/usr/bin/env node
/**
 * Clawdmint Agents — IPFS Upload Script (v2)
 * 
 * Uploads generated SVGs and metadata to Pinata IPFS.
 * Uses batch approach for large collections.
 * 
 * Steps:
 *   1. Upload all images (SVGs) as a directory → IMAGES_CID
 *   2. Update metadata JSONs with correct IPFS image URIs
 *   3. Upload all metadata as a directory → METADATA_CID
 *   4. Save CIDs to output/ipfs-cids.json
 * 
 * Usage:
 *   node scripts/upload-to-ipfs.js [--mode=all|images|metadata] [--batch=500]
 * 
 * Environment:
 *   PINATA_JWT — Pinata API JWT token (required)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PINATA_JWT = process.env.PINATA_JWT;
if (!PINATA_JWT) {
  console.error('ERROR: PINATA_JWT not set in .env');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');
const METADATA_DIR = path.join(OUTPUT_DIR, 'metadata');
const CIDS_FILE = path.join(OUTPUT_DIR, 'ipfs-cids.json');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v; return acc;
}, {});
const MODE = args.mode || 'all';
const BATCH_SIZE = parseInt(args.batch || '500', 10);

const PINATA_API = 'https://api.pinata.cloud';

// ═══════════════════════════════════════════════════════════════════════
// PINATA API HELPERS
// ═══════════════════════════════════════════════════════════════════════

async function pinDirectoryToIPFS(files, dirName) {
  const formData = new FormData();

  for (const { name, buffer, contentType } of files) {
    const blob = new Blob([buffer], { type: contentType });
    formData.append('file', blob, `${dirName}/${name}`);
  }

  formData.append('pinataMetadata', JSON.stringify({ name: dirName }));
  formData.append('pinataOptions', JSON.stringify({ wrapWithDirectory: false }));

  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.IpfsHash;
}

/**
 * Upload a directory of files to IPFS.
 * Tries full directory first; falls back to batch approach if it fails.
 */
async function uploadDirectory(dirPath, dirName, contentType, ext) {
  const allFiles = fs.readdirSync(dirPath)
    .filter(f => f.endsWith(ext))
    .sort((a, b) => {
      const numA = parseInt(a.replace(ext, '')) || 0;
      const numB = parseInt(b.replace(ext, '')) || 0;
      return numA - numB;
    });

  const totalSize = allFiles.reduce((s, f) => s + fs.statSync(path.join(dirPath, f)).size, 0);
  console.log(`  📁 ${allFiles.length} files | ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

  // Also check for collection.json
  const hasCollectionJson = ext === '.json' && fs.existsSync(path.join(dirPath, 'collection.json'));

  // Try uploading all at once first
  console.log(`  ⬆️  Uploading as single directory...`);

  try {
    const files = allFiles.map(f => ({
      name: f,
      buffer: fs.readFileSync(path.join(dirPath, f)),
      contentType,
    }));

    // Add collection.json if present
    if (hasCollectionJson) {
      files.push({
        name: 'collection.json',
        buffer: fs.readFileSync(path.join(dirPath, 'collection.json')),
        contentType: 'application/json',
      });
    }

    const cid = await pinDirectoryToIPFS(files, dirName);
    console.log(`  ✅ Uploaded! CID: ${cid}`);
    return cid;
  } catch (err) {
    console.log(`  ⚠️  Single upload failed: ${err.message}`);
    console.log(`  🔄 Switching to batch mode (batch size: ${BATCH_SIZE})...`);
  }

  // Batch fallback: upload in chunks, then combine
  // NOTE: Each batch = separate CID. For proper IPFS directory, 
  // we need all files under one CID. Let's try smaller directory size.
  
  // Try progressively smaller batch sizes
  for (let batchSize of [5000, 2000, 1000, 500]) {
    if (allFiles.length <= batchSize) continue;
    
    console.log(`  🔄 Trying batch size: ${batchSize}...`);
    
    try {
      const files = allFiles.slice(0, batchSize).map(f => ({
        name: f,
        buffer: fs.readFileSync(path.join(dirPath, f)),
        contentType,
      }));
      
      // Test with first batch
      const testCid = await pinDirectoryToIPFS(files, `${dirName}-test`);
      console.log(`  ✅ Test batch of ${batchSize} worked! CID: ${testCid}`);
      
      // Now we know the max size. Upload remaining in batches
      // But we need all under one CID for proper NFT metadata...
      // For this we need to upload all at once within the size limit.
      
      // Unpin the test
      try {
        await fetch(`${PINATA_API}/pinning/unpin/${testCid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${PINATA_JWT}` },
        });
      } catch {}
      
      // If batchSize < total, we need to split into multiple directories
      const totalBatches = Math.ceil(allFiles.length / batchSize);
      console.log(`  📦 Splitting into ${totalBatches} directories of ${batchSize} each`);
      
      const batchCids = [];
      for (let i = 0; i < totalBatches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, allFiles.length);
        const batchFiles = allFiles.slice(start, end).map(f => ({
          name: f,
          buffer: fs.readFileSync(path.join(dirPath, f)),
          contentType,
        }));
        
        // Add collection.json to last batch
        if (hasCollectionJson && i === totalBatches - 1) {
          batchFiles.push({
            name: 'collection.json',
            buffer: fs.readFileSync(path.join(dirPath, 'collection.json')),
            contentType: 'application/json',
          });
        }
        
        const partName = `${dirName}-part${i + 1}`;
        console.log(`  [${i + 1}/${totalBatches}] Uploading ${batchFiles.length} files as "${partName}"...`);
        const cid = await pinDirectoryToIPFS(batchFiles, partName);
        batchCids.push({ cid, start, end, files: allFiles.slice(start, end) });
        console.log(`  ✅ Part ${i + 1} CID: ${cid}`);
        
        // Small delay to avoid rate limiting
        if (i < totalBatches - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      // Save batch CIDs for reference
      return { batched: true, batchCids, batchSize };
    } catch (batchErr) {
      console.log(`  ❌ Batch size ${batchSize} failed: ${batchErr.message}`);
      continue;
    }
  }
  
  throw new Error('All upload attempts failed. Consider upgrading your Pinata plan.');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════════════
// MAIN UPLOAD FLOW
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n📤 Clawdmint Agents — IPFS Upload (v2)\n');

  // Load existing CIDs if any
  let cids = {};
  if (fs.existsSync(CIDS_FILE)) {
    cids = JSON.parse(fs.readFileSync(CIDS_FILE, 'utf8'));
    console.log('📋 Existing CIDs:', Object.keys(cids).join(', '));
  }

  // ── STEP 1: Upload images ──
  if (MODE === 'all' || MODE === 'images') {
    console.log('\n── Step 1: Uploading SVG images ──');
    
    const result = await uploadDirectory(
      IMAGES_DIR, 'clawdmint-agents-images', 'image/svg+xml', '.svg'
    );
    
    if (typeof result === 'string') {
      cids.images = result;
    } else {
      // Batched result
      cids.images = result;
      console.log(`\n  📦 Images uploaded in ${result.batchCids.length} batches`);
    }

    // Save progress
    fs.writeFileSync(CIDS_FILE, JSON.stringify(cids, null, 2));
  }

  // ── STEP 2: Update metadata with IPFS image URIs ──
  if (MODE === 'all' || MODE === 'metadata') {
    console.log('\n── Step 2: Updating metadata with IPFS URIs ──');

    const imagesCid = typeof cids.images === 'string' ? cids.images : null;
    
    const metaFiles = fs.readdirSync(METADATA_DIR)
      .filter(f => f.endsWith('.json') && f !== 'collection.json');
    let updated = 0;

    for (const f of metaFiles) {
      const filePath = path.join(METADATA_DIR, f);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const tokenId = f.replace('.json', '');
      
      if (imagesCid) {
        // Single CID — straightforward
        json.image = `ipfs://${imagesCid}/${tokenId}.svg`;
      } else if (cids.images && cids.images.batched) {
        // Find which batch this token is in
        const batch = cids.images.batchCids.find(b => 
          b.files.includes(`${tokenId}.svg`)
        );
        if (batch) {
          json.image = `ipfs://${batch.cid}/${tokenId}.svg`;
        }
      }
      
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
      updated++;
    }

    // Update collection.json
    const collectionPath = path.join(METADATA_DIR, 'collection.json');
    if (fs.existsSync(collectionPath)) {
      const collJson = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
      collJson.image = `https://clawdmint.xyz/agents/placeholder.svg`;
      fs.writeFileSync(collectionPath, JSON.stringify(collJson, null, 2));
    }

    console.log(`  ✅ Updated ${updated} metadata files`);

    // ── STEP 3: Upload metadata ──
    console.log('\n── Step 3: Uploading metadata ──');

    const metaResult = await uploadDirectory(
      METADATA_DIR, 'clawdmint-agents-metadata', 'application/json', '.json'
    );
    
    if (typeof metaResult === 'string') {
      cids.metadata = metaResult;
    } else {
      cids.metadata = metaResult;
      console.log(`\n  📦 Metadata uploaded in ${metaResult.batchCids.length} batches`);
    }
  }

  // ── Save CIDs ──
  fs.writeFileSync(CIDS_FILE, JSON.stringify(cids, null, 2));

  // ── Summary ──
  const imgCid = typeof cids.images === 'string' ? cids.images : 'BATCHED';
  const metaCid = typeof cids.metadata === 'string' ? cids.metadata : 'BATCHED';
  
  console.log('\n═══════════════════════════════════════════════');
  console.log('🎉 Upload Complete!\n');
  console.log('📋 IPFS CIDs:');
  console.log(`   Images:   ${imgCid}`);
  console.log(`   Metadata: ${metaCid}`);
  console.log('\n📝 Contract Configuration:');
  console.log(`   Pre-reveal baseURI:  https://clawdmint.xyz/api/metadata/placeholder/`);
  console.log(`   Reveal baseURI:      ipfs://${metaCid}/`);
  console.log(`   Token URI example:   ipfs://${metaCid}/1.json`);
  console.log('\n📁 CIDs saved to:', CIDS_FILE);
  console.log('');
}

main().catch(e => {
  console.error('\n❌ Upload failed:', e.message);
  process.exit(1);
});

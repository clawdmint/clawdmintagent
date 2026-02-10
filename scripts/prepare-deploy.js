#!/usr/bin/env node
/**
 * Prepare agent collection assets for deployment.
 * Copies generated SVGs and metadata to public/ for static hosting.
 * Updates metadata image URLs to point to the server.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://clawdmint.xyz';
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'agents-data');
const IMAGES_SRC = path.join(OUTPUT_DIR, 'images');
const METADATA_SRC = path.join(OUTPUT_DIR, 'metadata');
const IMAGES_DEST = path.join(PUBLIC_DIR, 'images');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  console.log('📦 Preparing agent collection for deploy...\n');

  // Check if output exists
  if (!fs.existsSync(IMAGES_SRC) || !fs.existsSync(METADATA_SRC)) {
    console.log('⚠️  Output directory not found. Running generation first...');
    const { execSync } = require('child_process');
    execSync('node scripts/generate-collection.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  }

  // Create directories
  ensureDir(PUBLIC_DIR);
  ensureDir(IMAGES_DEST);

  // Copy SVGs
  const svgFiles = fs.readdirSync(IMAGES_SRC).filter(f => f.endsWith('.svg'));
  console.log(`📁 Copying ${svgFiles.length} SVGs to public/agents-data/images/`);
  
  let copied = 0;
  for (const f of svgFiles) {
    fs.copyFileSync(path.join(IMAGES_SRC, f), path.join(IMAGES_DEST, f));
    copied++;
    if (copied % 1000 === 0) console.log(`   ${copied}/${svgFiles.length} copied...`);
  }
  console.log(`   ✅ ${copied} SVGs copied`);

  // Copy and update metadata
  const metaFiles = fs.readdirSync(METADATA_SRC).filter(f => f.endsWith('.json'));
  console.log(`\n📁 Copying ${metaFiles.length} metadata files to public/agents-data/`);

  let metaCopied = 0;
  for (const f of metaFiles) {
    const filePath = path.join(METADATA_SRC, f);
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Update image URL to server URL
    if (f !== 'collection.json') {
      const tokenId = f.replace('.json', '');
      json.image = `${APP_URL}/agents-data/images/${tokenId}.svg`;
    } else {
      json.image = `${APP_URL}/agents/placeholder.svg`;
    }

    // Update external_url
    if (json.external_url) {
      json.external_url = `${APP_URL}/mint`;
    }

    fs.writeFileSync(path.join(PUBLIC_DIR, f), JSON.stringify(json, null, 2));
    metaCopied++;
    if (metaCopied % 1000 === 0) console.log(`   ${metaCopied}/${metaFiles.length} copied...`);
  }
  console.log(`   ✅ ${metaCopied} metadata files copied`);

  // Copy placeholder
  const placeholderSrc = path.join(OUTPUT_DIR, 'placeholder.svg');
  if (fs.existsSync(placeholderSrc)) {
    fs.copyFileSync(placeholderSrc, path.join(PUBLIC_DIR, 'images', 'placeholder.svg'));
  }

  // Summary
  const totalSize = (function getDirSize(dir) {
    let total = 0;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      const st = fs.statSync(fp);
      total += st.isDirectory() ? getDirSize(fp) : st.size;
    }
    return total;
  })(PUBLIC_DIR);

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`✅ Deploy preparation complete!`);
  console.log(`   Files: ${copied + metaCopied}`);
  console.log(`   Size:  ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   Path:  public/agents-data/`);
  console.log(`\n📝 Contract Configuration:`);
  console.log(`   Pre-reveal baseURI: ${APP_URL}/api/metadata/placeholder/`);
  console.log(`   Reveal baseURI:     ${APP_URL}/agents-data/`);
  console.log(`   Token URI example:  ${APP_URL}/agents-data/1.json`);
  console.log(`   Image example:      ${APP_URL}/agents-data/images/1.svg`);
  console.log('');
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});

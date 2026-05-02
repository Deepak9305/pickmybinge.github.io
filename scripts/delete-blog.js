import fs from 'fs';
import path from 'path';
import { generateSitemap } from './generate-sitemap.js';

const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const BLOGS_INDEX = path.join(process.cwd(), 'public/blogs-index.json');

function deleteBlog(slug) {
    console.log(`Deleting blog: ${slug}`);

    // Accept ID like "2026-05-02-keyword-slug" → maps to "2026/05/02/keyword-slug"
    const clean = slug.replace(/\.(html|json)$/, '');
    const dateMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
    const baseSlug = dateMatch ? dateMatch[4] : clean;
    const subDir   = dateMatch
        ? path.join(BLOG_DIR, dateMatch[1], dateMatch[2], dateMatch[3])
        : BLOG_DIR;

    let fileName;
    if (fs.existsSync(path.join(subDir, baseSlug + '.json'))) fileName = baseSlug + '.json';
    else if (fs.existsSync(path.join(subDir, baseSlug + '.html'))) fileName = baseSlug + '.html';
    else { console.error(`Error: No file found for slug "${clean}"`); process.exit(1); }

    const filePath = path.join(subDir, fileName);

    // 1. Delete the file
    fs.unlinkSync(filePath);
    console.log(`Deleted file: ${fileName}`);

    // 2. Update manifest.json
    const manifestPath = path.join(BLOG_DIR, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifest = manifest.filter(f => path.basename(f.toString()) !== fileName);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`Updated manifest.json`);
    }

    // 3. Update blogs-index.json
    if (fs.existsSync(BLOGS_INDEX)) {
        let index = JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8'));
        index = index.filter(p => p.id !== clean);
        fs.writeFileSync(BLOGS_INDEX, JSON.stringify(index, null, 4));
        console.log(`Updated blogs-index.json`);
    }

    // 4. Regenerate sitemap
    generateSitemap();

    console.log(`Successfully removed ${baseSlug} and refreshed sitemap.`);
}

const targetSlug = process.argv[2];
if (!targetSlug) {
    console.error("Usage: node scripts/delete-blog.js [slug]");
    process.exit(1);
}

deleteBlog(targetSlug);

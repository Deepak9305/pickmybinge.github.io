import fs from 'fs';
import path from 'path';
import { generateSitemap } from './generate-sitemap.js';

const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const BLOGS_INDEX = path.join(process.cwd(), 'public/blogs-index.json');

function deleteBlog(slug) {
    console.log(`Deleting blog: ${slug}`);

    const baseSlug = slug.replace(/\.(html|json)$/, '');
    const jsonFile = baseSlug + '.json';
    const htmlFile = baseSlug + '.html';

    let fileName;
    if (fs.existsSync(path.join(BLOG_DIR, jsonFile))) fileName = jsonFile;
    else if (fs.existsSync(path.join(BLOG_DIR, htmlFile))) fileName = htmlFile;
    else { console.error(`Error: No file found for slug "${baseSlug}"`); process.exit(1); }

    const filePath = path.join(BLOG_DIR, fileName);

    // 1. Delete the file
    fs.unlinkSync(filePath);
    console.log(`Deleted file: ${fileName}`);

    // 2. Update manifest.json
    const manifestPath = path.join(BLOG_DIR, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifest = manifest.filter(f => f !== fileName);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`Updated manifest.json`);
    }

    // 3. Update blogs-index.json
    if (fs.existsSync(BLOGS_INDEX)) {
        let index = JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8'));
        index = index.filter(p => p.id !== baseSlug);
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

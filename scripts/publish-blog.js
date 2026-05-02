import fs from 'fs';
import path from 'path';

const DRAFTS_DIR   = path.join(process.cwd(), 'drafts');
const BLOG_DIR     = path.join(process.cwd(), 'public/content/blogs');
const BLOGS_INDEX  = path.join(process.cwd(), 'public/blogs-index.json');
const MANIFEST_PATH = path.join(process.cwd(), 'public/content/blogs/manifest.json');

// DRAFT_FILENAME is a relative path like "2026/05/02/keyword-slug.html" or "latest"
let fileName = process.env.DRAFT_FILENAME;
if (!fileName) {
    console.error('Error: DRAFT_FILENAME env var is required (e.g. 2026/05/02/keyword-slug.html or latest)');
    process.exit(1);
}

if (fileName === 'latest') {
    const drafts = fs.existsSync(DRAFTS_DIR)
        ? fs.readdirSync(DRAFTS_DIR, { recursive: true })
            .map(f => f.toString().replace(/\\/g, '/'))
            .filter(f => f.endsWith('.html') || f.endsWith('.json'))
            .sort()
            .reverse()
        : [];
    if (drafts.length === 0) {
        console.error('Error: No drafts found to publish.');
        process.exit(1);
    }
    fileName = drafts[0];
    console.log(`Resolved "latest" to draft: ${fileName}`);
}

// Export the resolved filename back to GitHub Actions environment
if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `ACTUALLY_PUBLISHED=${fileName}\n`);
}

const normalizedFileName = fileName.replace(/\\/g, '/');
const parts = normalizedFileName.split('/');
const basename = parts[parts.length - 1];
const slug = basename.replace(/\.(html|json)$/, '');

// ID is just the slug — no date prefix — giving clean URLs like /blog.html?id=is-succession-worth-watching
const fileId = slug;

const draftPath = path.join(DRAFTS_DIR, normalizedFileName);
if (!fs.existsSync(draftPath)) {
    console.error(`Error: Draft not found at ${draftPath}`);
    process.exit(1);
}

const destDir  = BLOG_DIR;
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const isHtml = basename.endsWith('.html');
const outFileName = `${slug}.${isHtml ? 'html' : 'json'}`;
let entry;

if (isHtml) {
    const text = fs.readFileSync(draftPath, 'utf-8');
    fs.writeFileSync(path.join(destDir, outFileName), text);
    console.log(`✅ Published: public/content/blogs/${outFileName}`);

    const getMeta = (name, isProp = false) => {
        const attr = isProp ? 'property' : 'name';
        const m = text.match(new RegExp(`<meta ${attr}="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" content="([^"]*)"`));
        return m ? m[1] : '';
    };

    const h1Match = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const title     = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : slug;
    // Always use the slug as the ID — clean URLs, no date in the link
    const id        = slug;
    const date      = getMeta('date');
    const category  = getMeta('category') || 'general';
    const excerpt   = getMeta('description');
    const thumbnail = getMeta('og:image', true) || null;
    const tmdbIdsRaw = getMeta('tmdb-ids');
    const tmdb_ids  = tmdbIdsRaw ? tmdbIdsRaw.split(',').map(Number).filter(Boolean) : [];

    entry = { id, date, title, category, excerpt, thumbnail: thumbnail || null, tmdb_ids, link: `/blog.html?id=${id}` };
} else {
    const post = JSON.parse(fs.readFileSync(draftPath, 'utf-8'));
    fs.writeFileSync(path.join(destDir, outFileName), JSON.stringify(post, null, 4));
    console.log(`✅ Published: public/content/blogs/${outFileName}`);
    const thumbMatch = (post.content || '').match(/src="(https:\/\/image\.tmdb\.org\/[^"]+)"/);
    entry = {
        // Use slug as ID for clean URLs — strip any date prefix from the JSON's own id field
        id: slug,
        date: post.date,
        title: post.title,
        category: post.category,
        excerpt: post.excerpt,
        thumbnail: post.thumbnail || (thumbMatch ? thumbMatch[1] : null),
        tmdb_ids: post.tmdb_ids,
        link: `/blog.html?id=${slug}`
    };
}

// Update manifest (stores flattened paths)
let manifest = [];
if (fs.existsSync(MANIFEST_PATH)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')); } catch { }
    if (!Array.isArray(manifest)) manifest = [];
}
if (!manifest.includes(outFileName)) {
    manifest.unshift(outFileName);
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log('✅ manifest.json updated.');
}

// Update blogs-index.json
let index = [];
if (fs.existsSync(BLOGS_INDEX)) {
    try { index = JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8')); } catch { }
}
index = index.filter(p => p.id !== entry.id);
index.unshift(entry);
fs.writeFileSync(BLOGS_INDEX, JSON.stringify(index, null, 4));
console.log(`✅ blogs-index.json updated (${index.length} entries).`);

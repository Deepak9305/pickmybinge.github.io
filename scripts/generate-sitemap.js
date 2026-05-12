import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const DOMAIN = 'https://www.pickmybinge.com';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const MANIFEST_PATH = path.join(BLOG_DIR, 'manifest.json');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'sitemap.xml');

function getPublishedBlogFiles() {
    if (fs.existsSync(MANIFEST_PATH)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
            if (Array.isArray(manifest)) {
                return manifest
                    .map((file) => path.basename(file.toString()))
                    .filter((file) => /\.(html|json)$/i.test(file));
            }
        } catch {
            // Fall back to the filesystem scan below.
        }
    }

    if (!fs.existsSync(BLOG_DIR)) return [];

    return fs.readdirSync(BLOG_DIR, { recursive: true })
        .map((file) => file.toString())
        .filter((file) => /\.(html|json)$/i.test(file) && path.basename(file) !== 'manifest.json')
        .map((file) => path.basename(file));
}

export function generateSitemap() {
    console.log('Generating sitemap...');

    const pages = [
        { url: '/', priority: '1.0', changefreq: 'daily' },
        { url: '/blog.html', priority: '0.9', changefreq: 'daily' },
        { url: '/cringe.html', priority: '0.8', changefreq: 'weekly' },
        { url: '/quiz.html', priority: '0.8', changefreq: 'weekly' },
        { url: '/contact.html', priority: '0.5', changefreq: 'monthly' },
        { url: '/privacy.html', priority: '0.4', changefreq: 'monthly' },
        { url: '/terms.html', priority: '0.4', changefreq: 'monthly' }
    ];

    // Add blog posts
    const blogFiles = getPublishedBlogFiles();
    if (blogFiles.length > 0) {
        const seen = new Set();
        blogFiles.forEach((file) => {
            const slug = file.replace(/\.(html|json)$/i, '');
            if (seen.has(slug)) return;
            seen.add(slug);

            const filePath = path.join(BLOG_DIR, file);
            const lastmod = fs.existsSync(filePath)
                ? fs.statSync(filePath).mtime.toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0];
            pages.push({
                url: `/blog.html?id=${slug}`,
                lastmod,
                priority: '0.7',
                changefreq: 'monthly'
            });
        });
    }

    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(page => `  <url>
    <loc>${DOMAIN}${page.url}</loc>
    <lastmod>${page.lastmod || new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    fs.writeFileSync(OUTPUT_FILE, sitemapContent);
    console.log(`Sitemap generated successfully at ${OUTPUT_FILE}`);
}

// Run if called directly (cross-platform: pathToFileURL normalizes Windows paths)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    generateSitemap();
}

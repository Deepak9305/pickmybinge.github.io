import fs from 'fs';
import path from 'path';

const DOMAIN = 'https://www.pickmybinge.com';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'sitemap.xml');

function generateSitemap() {
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
    if (fs.existsSync(BLOG_DIR)) {
        const blogFiles = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.json'));
        blogFiles.forEach(file => {
            const slug = file.replace('.json', '');
            pages.push({
                url: `/blog.html?id=${slug}`,
                priority: '0.7',
                changefreq: 'monthly'
            });
        });
    }

    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(page => `  <url>
    <loc>${DOMAIN}${page.url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    fs.writeFileSync(OUTPUT_FILE, sitemapContent);
    console.log(`Sitemap generated successfully at ${OUTPUT_FILE}`);
}

generateSitemap();

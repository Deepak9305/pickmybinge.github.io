import fs from 'fs';
import path from 'path';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BLOG_FILE = process.env.BLOG_FILE;
const FRANCHISE = process.env.FRANCHISE;

async function fetchTMDB(endpoint, params = {}) {
    const url = new URL(`https://api.themoviedb.org/3/${endpoint}`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status} for ${endpoint}`);
    return res.json();
}

function insertImagesAfterH2s(content, images) {
    let imgIdx = 0;
    return content.replace(/<\/h2>/g, (match, offset) => {
        if (imgIdx >= images.length) return match;
        const before = content.slice(0, offset + match.length);
        const h2Text = (before.match(/<h2[^>]*>([^<]*)<\/h2>$/) || [])[1] || '';
        if (/verdict|watch|read next/i.test(h2Text)) return match;
        const img = images[imgIdx++];
        return `${match}\n<img loading="lazy" src="${img.url}" alt="${img.alt}" class="blog-image">`;
    });
}

async function main() {
    if (!TMDB_API_KEY) { console.error('TMDB_API_KEY missing'); process.exit(1); }
    if (!BLOG_FILE)    { console.error('BLOG_FILE missing');    process.exit(1); }
    if (!FRANCHISE)    { console.error('FRANCHISE missing');    process.exit(1); }

    const blogPath = path.join(process.cwd(), BLOG_FILE);
    if (!fs.existsSync(blogPath)) { console.error(`File not found: ${blogPath}`); process.exit(1); }

    const isHtml = BLOG_FILE.endsWith('.html');

    // 1. Find the show/movie on TMDB
    const searchRes = await fetchTMDB('search/multi', { query: FRANCHISE, language: 'en-US', page: 1 });
    const match = (searchRes.results || []).find(r =>
        (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path
    );
    if (!match) { console.error('No TMDB match for:', FRANCHISE); process.exit(1); }

    const { id, media_type } = match;
    const title = match.title || match.name;
    console.log(`Matched: ${title} (${media_type}/${id})`);

    // 2. Fetch posters + backdrops
    const imagesRes = await fetchTMDB(`${media_type}/${id}/images`);
    const posters   = (imagesRes.posters   || []).slice(0, 4);
    const backdrops = (imagesRes.backdrops || []).slice(0, 4);

    const inContent = backdrops.slice(0, 3).map(b => ({
        url: `https://image.tmdb.org/t/p/w780${b.file_path}`,
        alt: `${title} scene`
    }));
    if (inContent.length < 3 && posters.length > 1) {
        inContent.push(...posters.slice(1, 3 - inContent.length + 1).map(p => ({
            url: `https://image.tmdb.org/t/p/w500${p.file_path}`,
            alt: `${title} poster`
        })));
    }

    const newThumb = posters.length > 0 ? `https://image.tmdb.org/t/p/w500${posters[0].file_path}` : null;

    if (isHtml) {
        let html = fs.readFileSync(blogPath, 'utf-8');

        // 3. Update thumbnail meta tag
        if (newThumb) {
            html = html.replace(
                /(<meta property="og:image" content=")[^"]*(")/,
                `$1${newThumb}$2`
            );
            console.log(`  thumbnail → ${newThumb}`);
        }

        // 4. Insert images into content after substantive H2s
        html = insertImagesAfterH2s(html, inContent);
        const insertedCount = (html.match(/class="blog-image"/g) || []).length;
        console.log(`  ${insertedCount} image(s) inserted into content`);

        fs.writeFileSync(blogPath, html);
        console.log(`✅ Patched: ${BLOG_FILE}`);

        // 5. Update blogs-index.json thumbnail
        if (newThumb) {
            const idMatch = html.match(/<meta name="id" content="([^"]*)"/);
            const blogId = idMatch ? idMatch[1] : path.basename(BLOG_FILE, '.html');
            const indexPath = path.join(process.cwd(), 'public/blogs-index.json');
            if (fs.existsSync(indexPath)) {
                const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
                const entry = index.find(p => p.id === blogId);
                if (entry) {
                    entry.thumbnail = newThumb;
                    fs.writeFileSync(indexPath, JSON.stringify(index, null, 4));
                    console.log(`✅ blogs-index.json thumbnail updated`);
                }
            }
        }
    } else {
        // JSON path
        const blog = JSON.parse(fs.readFileSync(blogPath, 'utf-8'));

        // 3. Update thumbnail + tmdb_ids
        if (newThumb) {
            blog.thumbnail = newThumb;
            console.log(`  thumbnail → ${blog.thumbnail}`);
        }
        blog.tmdb_ids = [id];

        // 4. Insert images into content after substantive H2s
        blog.content = insertImagesAfterH2s(blog.content, inContent);
        const insertedCount = (blog.content.match(/class="blog-image"/g) || []).length;
        console.log(`  ${insertedCount} image(s) inserted into content`);

        fs.writeFileSync(blogPath, JSON.stringify(blog, null, 4));
        console.log(`✅ Patched: ${BLOG_FILE}`);

        // 5. Update blogs-index.json thumbnail
        const indexPath = path.join(process.cwd(), 'public/blogs-index.json');
        if (fs.existsSync(indexPath) && blog.thumbnail) {
            const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
            const entry = index.find(p => p.id === blog.id);
            if (entry) {
                entry.thumbnail = blog.thumbnail;
                fs.writeFileSync(indexPath, JSON.stringify(index, null, 4));
                console.log(`✅ blogs-index.json thumbnail updated`);
            }
        }
    }
}

main().catch(e => { console.error(e.message); process.exit(1); });

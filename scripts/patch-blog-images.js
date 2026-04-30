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
    // Insert after the first N h2 closing tags, skip "The Verdict" and "Watch"
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

    const blog = JSON.parse(fs.readFileSync(blogPath, 'utf-8'));

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

    // Use backdrops in-content (cinematic), poster as thumbnail
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

    // 3. Update thumbnail + tmdb_ids
    if (posters.length > 0) {
        blog.thumbnail = `https://image.tmdb.org/t/p/w500${posters[0].file_path}`;
        console.log(`  thumbnail → ${blog.thumbnail}`);
    }
    blog.tmdb_ids = [id];

    // 4. Insert images into content after substantive H2s
    blog.content = insertImagesAfterH2s(blog.content, inContent);
    const insertedCount = (blog.content.match(/class="blog-image"/g) || []).length;
    console.log(`  ${insertedCount} image(s) inserted into content`);

    fs.writeFileSync(blogPath, JSON.stringify(blog, null, 4));
    console.log(`✅ Patched: ${BLOG_FILE}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

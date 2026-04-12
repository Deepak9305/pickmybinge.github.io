import fs from 'fs';
import path from 'path';
import { generateSitemap } from './generate-sitemap.js';

/**
 * Autonomous Blog Generation Pipeline
 * Grounded with real TMDB data + retry logic + hostile fact-check refinement.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BLOG_DIR = path.join(process.cwd(), 'public/content/blogs');
const BLOGS_INDEX = path.join(process.cwd(), 'public/blogs-index.json');

async function callGroq(model, prompt) {
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing from environment.");
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(`Groq API Error: ${data.error.message}`);
    return data.choices[0].message.content;
}

async function callGroqWithRetry(model, prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await callGroq(model, prompt);
        } catch (e) {
            console.error(`Attempt ${i + 1} failed for model ${model}:`, e.message);
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function fetchFromTMDB(endpoint, params = {}) {
    if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is missing from environment.");
    const url = new URL(`https://api.themoviedb.org/3/${endpoint}`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const response = await fetch(url.toString());
    return await response.json();
}

function parseJson(str) {
    try {
        const start = str.indexOf('{');
        const end = str.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("No JSON object found");
        let clean = str.substring(start, end + 1);
        clean = clean.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
        return JSON.parse(clean);
    } catch (e) {
        console.error("Failed to parse JSON. Raw snippet:", str.substring(0, 500));
        throw new Error(`JSON Parse Error: ${e.message}`);
    }
}

async function runPipeline(nicheHint = "Sci-Fi Thrillers") {
    try {
        console.log(`\n--- Starting Pipeline: ${nicheHint} ---`);
        if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });

        // STEP 1: FETCH REAL DATA FROM TMDB
        const currentYear = new Date().getFullYear();
        let tmdbData;
        if (nicheHint === 'K-Dramas') {
            tmdbData = await fetchFromTMDB('discover/tv', { 'first_air_date_year': currentYear - 1, 'with_original_language': 'ko', 'sort_by': 'popularity.desc' });
        } else {
            tmdbData = await fetchFromTMDB('discover/movie', { 'primary_release_year': currentYear, 'with_genres': '878,53', 'sort_by': 'popularity.desc' });
        }

        const realContent = tmdbData.results.slice(0, 5).map(item => ({
            title: item.title || item.name,
            id: item.id,
            overview: item.overview,
            release_date: item.release_date || item.first_air_date,
            tmdb_link: `https://www.themoviedb.org/${item.title ? 'movie' : 'tv'}/${item.id}`
        }));

        if (realContent.length === 0) throw new Error("No content found on TMDB.");
        console.log(`Fetched ${realContent.length} titles from TMDB.`);

        // STEP 2: WRITE ARTICLE
        const writingPrompt = `You are the Lead Editor at PickMyBinge. Write a VIRAL, high-retention feature article about these titles: ${JSON.stringify(realContent)}. 
        Guidelines: Punchy structure (2-3 sentences max per para), "The PickMyBinge Verdict" section, "Watch if you liked" recommendation, blockquotes, internal headers linked to TMDB. 
        Enthusiastic and expert voice. Output ONLY JSON with keys 'title', 'excerpt', and 'content'.`;

        const draftRaw = await callGroqWithRetry('llama-3.1-70b-versatile', writingPrompt);
        const draft = parseJson(draftRaw);

        // STEP 3: HOSTILE FACT-CHECK & EDITORIAL REFINE
        const refinerPrompt = `You are a Hostile Lead Editor at PickMyBinge. Review this article for AI fluff, inaccuracies, and weak writing:
        ${JSON.stringify(draft)}
        Fix any generic intro/outro. Ensure all title references match these real titles: ${JSON.stringify(realContent.map(t => t.title))}.
        Remove any hallucinated titles or facts not grounded in the source data.
        Return the final polished version as a JSON object with keys 'title', 'excerpt', and 'content'. Output ONLY the JSON.`;

        const polishedRaw = await callGroqWithRetry('llama-3.1-70b-versatile', refinerPrompt);
        const finalPost = parseJson(polishedRaw);

        // STEP 4: SAVE
        const date = new Date().toISOString().split('T')[0];
        const slug = nicheHint.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${date}-${slug}.json`;
        const filePath = path.join(BLOG_DIR, fileName);

        const newPost = {
            id: `${date}-${slug}`,
            date,
            title: finalPost.title,
            excerpt: finalPost.excerpt,
            content: finalPost.content,
            link: `/blog.html?id=${date}-${slug}`
        };

        fs.writeFileSync(filePath, JSON.stringify(newPost, null, 4));

        const manifestPath = path.join(BLOG_DIR, 'manifest.json');
        let manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : [];
        if (!manifest.includes(fileName)) {
            manifest.unshift(fileName);
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }

        // Update blogs index
        const existingIndex = fs.existsSync(BLOGS_INDEX) ? JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8')) : [];
        if (!existingIndex.find(p => p.id === newPost.id)) {
            const { content: _, ...postMeta } = newPost;
            existingIndex.unshift(postMeta);
            fs.writeFileSync(BLOGS_INDEX, JSON.stringify(existingIndex, null, 4));
        }

        console.log(`Successfully published: ${fileName}`);
        generateSitemap();
        return true;
    } catch (error) { console.error('Pipeline failed:', error.message); return false; }
}

async function main() {
    const targetNiche = process.env.BLOG_NICHE || "Sci-Fi Thrillers";
    await runPipeline(targetNiche);
}

main();

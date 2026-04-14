import fs from 'fs';
import path from 'path';

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
        // eslint-disable-next-line no-control-regex
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
            rating: item.vote_average,
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
            tmdb_link: `https://www.themoviedb.org/${item.title ? 'movie' : 'tv'}/${item.id}`
        }));

        if (realContent.length === 0) throw new Error("No content found on TMDB.");
        console.log(`Fetched ${realContent.length} titles from TMDB.`);

        // STEP 2: WRITE ARTICLE
        const writingPrompt = `You are the Lead Editor at PickMyBinge. Write a VIRAL, high-retention feature article about these titles: ${JSON.stringify(realContent)}. 
        Guidelines: Punchy structure (2-3 sentences max per para), "The PickMyBinge Verdict" section, "Watch if you liked" recommendation, blockquotes, internal headers linked to TMDB. 
        Crucial: For each title, you MUST include a reference to their poster URL provided in the data. Embed them using HTML <img> tags with class "blog-image".
        DO NOT use placeholders like [Official Poster Placeholder]. Use the real 'poster' URLs from the source JSON.
        CRITICAL: DO NOT generate any inline CSS, <style> tags, or inline style attributes. Rely entirely on external CSS classes.
        LENGTH REQUIREMENT: The article MUST comprehensively cover the titles and be at least 800 words in length. Expand deeply on plot analyses, trivia, and why readers should watch each title.
        Enthusiastic and expert voice. Output ONLY JSON with keys 'title', 'excerpt', and 'content'.`;

        const draftRaw = await callGroqWithRetry('llama-3.1-70b-versatile', writingPrompt);
        const draft = parseJson(draftRaw);

        // STEP 3: HOSTILE FACT-CHECK & EDITORIAL REFINE
        const refinerPrompt = `You are a Hostile Lead Editor at PickMyBinge. Review this article for AI fluff, inaccuracies, and weak writing:
        ${JSON.stringify(draft)}
        Fix any generic intro/outro. Ensure all title references match these real titles: ${JSON.stringify(realContent.map(t => t.title))}.
        Remove any hallucinated titles or facts not grounded in the source data.
        LENGTH REQUIREMENT: The final polished article MUST remain at least 800 words long. Do not over-condense the content.
        Return the final polished version as a JSON object with keys 'title', 'excerpt', and 'content'. Output ONLY the JSON.`;

        const polishedRaw = await callGroqWithRetry('llama-3.1-70b-versatile', refinerPrompt);
        const finalPost = parseJson(polishedRaw);

        // VALIDATION: Ensure all required fields exist
        if (!finalPost.title || !finalPost.excerpt || !finalPost.content) {
            throw new Error("Polished post is missing required fields (title, excerpt, or content).");
        }

        // STEP 4: SAVE
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const formattedDate = `${month}-${day}`;
        const slug = nicheHint.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${formattedDate}-${slug}.json`;

        const DRAFTS_DIR = path.join(process.cwd(), 'public/content/1st draft');
        if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });
        const filePath = path.join(DRAFTS_DIR, fileName);

        const newPost = {
            id: `${formattedDate}-${slug}`,
            date: now.toISOString().split('T')[0],
            title: finalPost.title,
            excerpt: finalPost.excerpt,
            content: finalPost.content,
            link: `/blog.html?id=${formattedDate}-${slug}`
        };

        fs.writeFileSync(filePath, JSON.stringify(newPost, null, 4));

        console.log(`Successfully generated draft: ${fileName} in 1st draft folder.`);
        return true;
    } catch (error) { console.error('Pipeline failed:', error.message); return false; }
}

async function main() {
    const niches = ["Sci-Fi Thrillers", "K-Dramas"];
    console.log(`Starting continuous generation for niches: ${niches.join(', ')}`);

    for (const niche of niches) {
        await runPipeline(niche);
        console.log(`Finished generation for: ${niche}\n`);
        // Add a small delay between generations to avoid rate limits if needed
        await new Promise(r => setTimeout(r, 2000));
    }
}

main();

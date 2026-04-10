import fs from 'fs';
import path from 'path';

/**
 * Autonomous Blog Generation Pipeline (ESM)
 * Updated with robust JSON parsing, retry logic, and high-authority prompts.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
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
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(`Groq API Error: ${data.error.message}`);
    return data.choices[0].message.content;
}

function parseJson(str) {
    try {
        const start = str.indexOf('{');
        const end = str.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("No JSON object found");
        const jsonStr = str.substring(start, end + 1);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse JSON. Raw string snippet:", str.substring(0, 500) + "...");
        throw new Error(`JSON Parse Error: ${e.message}`);
    }
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

async function runPipeline(nicheHint = "binge-worthy movies, TV shows, or K-dramas") {
    try {
        console.log(`\n--- Starting Pipeline for Niche: ${nicheHint} ---`);

        if (!fs.existsSync(BLOG_DIR)) {
            fs.mkdirSync(BLOG_DIR, { recursive: true });
        }

        // STEP 1: KEYWORD RESEARCH
        const keywordPrompt = `Find a mid-high volume, low competition keyword related to '${nicheHint}' for 2026. Focus on 'discovery' (long-tail keywords). Return ONLY the keyword.`;
        const keyword = await callGroqWithRetry('meta-llama/llama-4-scout-17b-16e-instruct', keywordPrompt);
        const cleanKeyword = keyword.trim().replace(/^"|"$/g, '');
        console.log(`Target Keyword: ${cleanKeyword}`);

        // STEP 2: RESEARCH & DRAFTING (Multi-Agent Simulation)
        const writingPrompt = `You are a Senior Technical Analyst at a top-tier entertainment publication. 
        Write a deeply researched, analytical, and authoritative feature article about '${cleanKeyword}'.
        Focus on:
        - Critical Analysis: Directorial choices, cinematography (use specific technical terms), and craftsmanship.
        - Industry Insights: Studio context, box office trends, or cultural significance.
        - Specificity: Use names of directors, shows, actors, and studios. NO hallucinations.
        
        Format in clean HTML (<p>, <h3>, <ul>, <li>). Output ONLY a JSON object with keys 'title', 'excerpt', and 'content'.`;

        const draftRaw = await callGroqWithRetry('openai/gpt-oss-120b', writingPrompt);
        const draft = parseJson(draftRaw);

        // STEP 3: HOSTILE FACT-CHECK & EDITORIAL REFINE
        const refinerPrompt = `You are a Hostile Lead Editor. Review this article for technical inaccuracies and AI fluff: 
        ${JSON.stringify(draft)}
        Fix any generic intro/outro. Ensure technical specs are consistent for '${cleanKeyword}'.
        Return the final polished version as a JSON object with keys 'title', 'excerpt', and 'content'. Output ONLY the JSON.`;

        const finalRaw = await callGroqWithRetry('meta-llama/llama-4-scout-17b-16e-instruct', refinerPrompt);
        const finalPost = parseJson(finalRaw);

        // STEP 4: SAVE
        const date = new Date().toISOString().split('T')[0];
        const slug = cleanKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${date}-${slug}.json`;
        const filePath = path.join(BLOG_DIR, fileName);

        const newPost = {
            id: `${date}-${slug}`,
            date: date,
            title: finalPost.title,
            excerpt: finalPost.excerpt,
            content: finalPost.content,
            link: `/blog.html?id=${date}-${slug}`
        };

        fs.writeFileSync(filePath, JSON.stringify(newPost, null, 4));

        // Update manifest
        const manifestPath = path.join(BLOG_DIR, 'manifest.json');
        let manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : [];
        if (!manifest.includes(fileName)) {
            manifest.unshift(fileName);
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }

        // Update index
        const existingIndex = fs.existsSync(BLOGS_INDEX) ? JSON.parse(fs.readFileSync(BLOGS_INDEX, 'utf-8')) : [];
        if (!existingIndex.find(p => p.id === newPost.id)) {
            const { content: _, ...postMeta } = newPost;
            existingIndex.unshift(postMeta);
            fs.writeFileSync(BLOGS_INDEX, JSON.stringify(existingIndex, null, 4));
        }

        console.log(`Successfully published blog: ${fileName}`);
        return true;
    } catch (error) {
        console.error('CRITICAL: Pipeline failed:', error.message);
        return false;
    }
}

// Single entry point for daily runs
runPipeline();

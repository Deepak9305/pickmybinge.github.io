import fs from 'fs';
import path from 'path';

const DRAFTS_DIR    = path.join(process.cwd(), 'drafts');
const WORKFLOW_FILE = path.join(process.cwd(), '.github/workflows/publish-blog.yml');

const drafts = fs.existsSync(DRAFTS_DIR)
    ? fs.readdirSync(DRAFTS_DIR, { recursive: true })
        .map(f => f.toString().replace(/\\/g, '/'))
        .filter(f => f.endsWith('.html') || f.endsWith('.json'))
        .sort()
        .reverse()
    : [];

const optionLines = drafts.length > 0
    ? drafts.map(d => `          - ${d}`).join('\n')
    : '          - (no drafts available)';

let content = fs.readFileSync(WORKFLOW_FILE, 'utf-8');
content = content.replace(
    /(        options:\n)((?:          - .+\n?)*)/,
    `$1${optionLines}\n`
);
fs.writeFileSync(WORKFLOW_FILE, content);

console.log(`Updated publish-blog.yml with ${drafts.length} draft option(s):`);
drafts.forEach(d => console.log(`  - ${d}`));

import { RizzResponse, BioResponse } from '../types';

// Simulated AI service for demo purposes
// In production, replace with actual AI API calls (OpenAI, Anthropic, etc.)

const TEASE_TEMPLATES = [
    "oh? that's cute. trying to impress me? 😏",
    "interesting move. didn't know you had it in you 👀",
    "bold strategy. let's see how it plays out... 🎲",
    "someone's feeling confident today 💅",
    "aww look at you trying. almost worked too 😌",
];

const SMOOTH_TEMPLATES = [
    "you know, there's something magnetic about the way you express yourself ✨",
    "I have to admit, you've got my full attention right now 🌙",
    "that's the kind of energy I've been looking for 💫",
    "you really know how to make someone feel special 🌟",
    "well played. I'm genuinely impressed 👑",
];

const CHAOTIC_TEMPLATES = [
    "BARK BARK WOOF WOOF 🐕 (respectfully)",
    "sir/ma'am this is a wendy's but go off i guess 🍔",
    "NEURON ACTIVATION 🧠⚡ *cartoon eyes pop out*",
    "not me actually giggling and kicking my feet rn 🦶✨",
    "alexa play 'Careless Whisper' 🎷😩",
];

const randomChoice = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const calculateLoveScore = (text: string, hasImage: boolean): number => {
    let score = 50 + Math.floor(Math.random() * 30); // Base 50-80
    if (text.length > 100) score += 5;
    if (hasImage) score += 10;
    if (text.toLowerCase().includes('beautiful') || text.toLowerCase().includes('amazing')) score += 5;
    return Math.min(99, score);
};

export const generateRizz = async (
    chatContext: string,
    imageBase64?: string
): Promise<RizzResponse> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

    const loveScore = calculateLoveScore(chatContext, !!imageBase64);

    // In production, you would send chatContext and imageBase64 to your AI service
    // Example: const response = await openai.chat.completions.create({...});

    return {
        tease: randomChoice(TEASE_TEMPLATES),
        smooth: randomChoice(SMOOTH_TEMPLATES),
        chaotic: randomChoice(CHAOTIC_TEMPLATES),
        loveScore,
    };
};

export const generateBio = async (userInfo: string): Promise<BioResponse> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

    const bios = [
        "Professional overthinker | Part-time comedian | Full-time snack enthusiast 🍕",
        "Collecting memories, not things ✨ | Dog lover | Coffee addict ☕",
        "Living life one adventure at a time 🌍 | Foodie | Sunset chaser 🌅",
        "Sarcasm is my love language 💬 | Music junkie | Hopeless romantic 🎵",
        "Making terrible decisions with great confidence 😎 | Gym rat | Pizza connoisseur 🏋️",
    ];

    return {
        bio: randomChoice(bios),
    };
};

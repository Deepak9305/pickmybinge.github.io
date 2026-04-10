export enum InputMode {
    CHAT = 'CHAT',
    BIO = 'BIO',
}

export interface RizzResponse {
    tease: string;
    smooth: string;
    chaotic: string;
    loveScore: number;
}

export interface BioResponse {
    bio: string;
}

export interface SavedItem {
    id: string;
    user_id: string;
    content: string;
    type: 'tease' | 'smooth' | 'chaotic' | 'bio';
    created_at: string;
}

export interface UserProfile {
    id: string;
    email?: string;
    credits: number;
    is_premium: boolean;
    last_daily_reset: string;
    created_at?: string;
}

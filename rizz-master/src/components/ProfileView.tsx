import React from 'react';
import { UserProfile } from '../types';

type FullScreenView = 'PRIVACY' | 'TERMS' | 'SUPPORT' | null;

interface ProfileViewProps {
    profile: UserProfile;
    onLogout: () => void;
    onUpgrade: () => void;
    onWatchAd: () => void;
    onNavigate: (page: FullScreenView) => void;
    isMusicPlaying: boolean;
    onToggleMusic: () => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({
    profile,
    onLogout,
    onUpgrade,
    onWatchAd,
    onNavigate,
    isMusicPlaying,
    onToggleMusic,
}) => {
    return (
        <div className="pb-24">
            {/* Header */}
            <header className="py-4 mb-6">
                <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">
                    Profile
                </h1>
            </header>

            {/* Profile Card */}
            <div className="glass p-6 rounded-3xl border border-white/10 mb-6">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-rose-500 flex items-center justify-center text-3xl">
                        👤
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="font-black text-lg">
                                {profile.email?.split('@')[0] || 'User'}
                            </h2>
                            {profile.is_premium && (
                                <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-full text-[10px] font-black text-black">
                                    VIP
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-white/40">{profile.email}</p>
                    </div>
                </div>

                {/* Credits */}
                {!profile.is_premium && (
                    <div className="bg-white/5 rounded-2xl p-4 mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-white/60 font-bold">Daily Credits</span>
                            <span className="text-2xl font-black text-rose-400">{profile.credits} ⚡</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                            <div
                                className="h-full rizz-gradient transition-all duration-500"
                                style={{ width: `${(profile.credits / 5) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Upgrade/Watch Ad */}
                {!profile.is_premium && (
                    <div className="flex gap-2">
                        <button
                            onClick={onUpgrade}
                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 text-black font-black text-xs hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            👑 Upgrade to VIP
                        </button>
                        <button
                            onClick={onWatchAd}
                            className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 transition-all text-xs font-bold"
                            title="Watch ad for +5 credits"
                        >
                            📺 +5
                        </button>
                    </div>
                )}
            </div>

            {/* Settings */}
            <div className="space-y-2 mb-6">
                <button
                    onClick={onToggleMusic}
                    className="w-full p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-xl">{isMusicPlaying ? '🔊' : '🔇'}</span>
                        <span className="text-sm font-bold">Background Music</span>
                    </div>
                    <span className={`text-xs font-bold ${isMusicPlaying ? 'text-green-400' : 'text-white/40'}`}>
                        {isMusicPlaying ? 'On' : 'Off'}
                    </span>
                </button>

                <button
                    onClick={() => onNavigate('PRIVACY')}
                    className="w-full p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-xl">🔒</span>
                        <span className="text-sm font-bold">Privacy Policy</span>
                    </div>
                    <span className="text-white/40">→</span>
                </button>

                <button
                    onClick={() => onNavigate('TERMS')}
                    className="w-full p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-xl">📄</span>
                        <span className="text-sm font-bold">Terms of Service</span>
                    </div>
                    <span className="text-white/40">→</span>
                </button>

                <button
                    onClick={() => onNavigate('SUPPORT')}
                    className="w-full p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-xl">💬</span>
                        <span className="text-sm font-bold">Support</span>
                    </div>
                    <span className="text-white/40">→</span>
                </button>
            </div>

            {/* Logout */}
            <button
                onClick={onLogout}
                className="w-full py-4 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black text-sm transition-all"
            >
                Logout
            </button>

            {/* Version */}
            <p className="text-center text-white/20 text-[10px] mt-6">
                Rizz Master v1.0.0
            </p>
        </div>
    );
};

export default ProfileView;

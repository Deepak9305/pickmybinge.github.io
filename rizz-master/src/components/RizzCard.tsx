import React from 'react';

interface RizzCardProps {
    label: string;
    content: string;
    icon: string;
    color: string;
    isSaved: boolean;
    onSave: () => void;
    onShare: () => void;
    delay: number;
}

const RizzCard: React.FC<RizzCardProps> = ({ label, content, icon, color, isSaved, onSave, onShare, delay }) => {
    return (
        <div
            className="glass p-4 rounded-3xl border border-white/10 relative overflow-hidden animate-fade-in-up"
            style={{ animationDelay: `${delay}s` }}
        >
            {/* Gradient Background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-10`} />

            {/* Content */}
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{icon}</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">{label}</h3>
                </div>

                <p className="text-sm font-medium leading-relaxed mb-4 min-h-[60px]">{content}</p>

                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={onShare}
                        className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-xs"
                    >
                        Share
                    </button>
                    <button
                        onClick={onSave}
                        className={`px-4 rounded-xl font-bold text-xl transition-all ${isSaved ? 'bg-rose-500/20 text-rose-400' : 'bg-white/5 text-white/50 hover:bg-white/10'
                            }`}
                    >
                        ♥
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RizzCard;

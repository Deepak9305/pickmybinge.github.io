import React from 'react';
import { SavedItem } from '../types';
import { copyToClipboard } from '../services/capacitorService';

interface SavedViewProps {
    isOpen: boolean;
    onClose: () => void;
    savedItems: SavedItem[];
    onDelete: (id: string) => void;
    onShare: (content: string) => void;
}

const SavedView: React.FC<SavedViewProps> = ({ isOpen, onClose, savedItems, onDelete, onShare }) => {
    if (!isOpen) return null;

    const getIcon = (type: SavedItem['type']) => {
        switch (type) {
            case 'tease': return '😏';
            case 'smooth': return '🪄';
            case 'chaotic': return '🤡';
            case 'bio': return '✨';
        }
    };

    const getColor = (type: SavedItem['type']) => {
        switch (type) {
            case 'tease': return 'from-purple-500 to-indigo-500';
            case 'smooth': return 'from-blue-500 to-cyan-500';
            case 'chaotic': return 'from-orange-500 to-red-500';
            case 'bio': return 'from-violet-500 to-fuchsia-500';
        }
    };

    return (
        <div className="pb-24">
            <header className="flex justify-between items-center py-4 mb-6">
                <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-rose-400 to-pink-400 bg-clip-text text-transparent">
                    Saved Collection
                </h1>
                <div className="text-sm text-white/40 font-bold">{savedItems.length} items</div>
            </header>

            {savedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="text-6xl mb-4 opacity-20">♥</div>
                    <p className="text-white/40 text-sm font-medium">No saved items yet</p>
                    <p className="text-white/20 text-xs mt-1">Save your favorite rizz to see them here</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {savedItems.map((item, index) => (
                        <div
                            key={item.id}
                            className="glass p-5 rounded-3xl border border-white/10 relative overflow-hidden animate-fade-in-up"
                            style={{ animationDelay: `${index * 0.05}s` }}
                        >
                            {/* Gradient Background */}
                            <div className={`absolute inset-0 bg-gradient-to-br ${getColor(item.type)} opacity-5`} />

                            <div className="relative z-10">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">{getIcon(item.type)}</span>
                                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                                            {item.type}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-white/20">
                                        {new Date(item.created_at).toLocaleDateString()}
                                    </span>
                                </div>

                                {/* Content */}
                                <p className="text-sm font-medium leading-relaxed mb-4 text-white/90">
                                    {item.content}
                                </p>

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            copyToClipboard(item.content);
                                            alert('Copied!');
                                        }}
                                        className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-xs"
                                    >
                                        Copy
                                    </button>
                                    <button
                                        onClick={() => onShare(item.content)}
                                        className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-xs"
                                    >
                                        Share
                                    </button>
                                    <button
                                        onClick={() => onDelete(item.id)}
                                        className="px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all font-bold text-xs"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SavedView;

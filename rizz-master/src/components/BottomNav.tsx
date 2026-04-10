import React from 'react';

type TabView = 'HOME' | 'SAVED' | 'PROFILE';

interface BottomNavProps {
    currentView: TabView;
    onChange: (view: TabView) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChange }) => {
    const tabs = [
        { id: 'HOME' as TabView, icon: '🏠', label: 'Home' },
        { id: 'SAVED' as TabView, icon: '♥', label: 'Saved' },
        { id: 'PROFILE' as TabView, icon: '👤', label: 'Profile' },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10 pb-[env(safe-area-inset-bottom)] z-50">
            <div className="flex items-center justify-around max-w-xl mx-auto px-4 py-3">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onChange(tab.id)}
                        className={`flex flex-col items-center gap-1 transition-all ${currentView === tab.id ? 'text-white scale-110' : 'text-white/40'
                            }`}
                    >
                        <span className="text-2xl">{tab.icon}</span>
                        <span className="text-[10px] font-bold">{tab.label}</span>
                    </button>
                ))}
            </div>
        </nav>
    );
};

export default BottomNav;

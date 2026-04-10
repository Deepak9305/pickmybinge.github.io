import React from 'react';

interface PremiumModalProps {
    onClose: () => void;
    onUpgrade: (plan: 'WEEKLY' | 'MONTHLY') => void;
    onRestore: () => void;
}

const PremiumModal: React.FC<PremiumModalProps> = ({ onClose, onUpgrade, onRestore }) => {
    return (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#0a0a0a] border border-white/10 rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar animate-slide-up">
                {/* Header */}
                <div className="relative p-6 pb-4 border-b border-white/10">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white/5 rounded-full text-white/60 hover:bg-white/10 transition-all"
                    >
                        ✕
                    </button>
                    <div className="text-center mb-4">
                        <div className="text-5xl mb-3">👑</div>
                        <h2 className="text-2xl font-black bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                            Go VIP
                        </h2>
                        <p className="text-white/50 text-xs mt-1">Unlimited Rizz Power</p>
                    </div>
                </div>

                {/* Features */}
                <div className="p-6 space-y-3">
                    {[
                        { icon: '⚡', text: 'Unlimited Generations' },
                        { icon: '🚫', text: 'No Ads' },
                        { icon: '🎯', text: 'Priority Support' },
                        { icon: '✨', text: 'Premium Badge' },
                    ].map((feature, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                            <span className="text-xl">{feature.icon}</span>
                            <span className="text-sm font-bold text-white/80">{feature.text}</span>
                        </div>
                    ))}
                </div>

                {/* Plans */}
                <div className="px-6 pb-6 space-y-3">
                    <button
                        onClick={() => onUpgrade('MONTHLY')}
                        className="w-full p-4 rounded-2xl bg-gradient-to-r from-yellow-500 to-amber-600 text-black relative overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform" />
                        <div className="relative flex items-center justify-between">
                            <div className="text-left">
                                <div className="font-black text-sm">Monthly VIP</div>
                                <div className="text-xs opacity-80">Best Value</div>
                            </div>
                            <div className="font-black text-2xl">$9.99</div>
                        </div>
                    </button>

                    <button
                        onClick={() => onUpgrade('WEEKLY')}
                        className="w-full p-4 rounded-2xl bg-white/10 hover:bg-white/15 transition-all text-white"
                    >
                        <div className="flex items-center justify-between">
                            <div className="text-left">
                                <div className="font-bold text-sm">Weekly VIP</div>
                                <div className="text-xs text-white/50">Try it out</div>
                            </div>
                            <div className="font-black text-xl">$2.99</div>
                        </div>
                    </button>

                    <div className="relative py-4">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="bg-[#0a0a0a] px-3 text-white/40">OR</span>
                        </div>
                    </div>

                    <button
                        onClick={onRestore}
                        className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-white/60 font-bold text-xs"
                    >
                        Restore Purchases
                    </button>
                </div>

                <p className="text-center text-white/20 text-[10px] pb-6 px-6">
                    Subscriptions auto-renew. Cancel anytime.
                </p>
            </div>
        </div>
    );
};

export default PremiumModal;

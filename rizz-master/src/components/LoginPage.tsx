import React from 'react';
import { supabase } from '../services/supabaseClient';

const LoginPage: React.FC = () => {
    const handleGoogleLogin = async () => {
        if (!supabase) {
            alert('⚠️ Supabase not configured. Please add your credentials to .env file.');
            return;
        }

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin,
                },
            });

            if (error) throw error;
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed. Please try again.');
        }
    };

    return (
        <div className="w-full h-[100dvh] relative overflow-hidden flex flex-col items-center justify-center p-6">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-[#020202]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#020202]" />

            {/* Gradient Orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/30 rounded-full blur-[120px] animate-pulse-glow" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-600/30 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDelay: '1s' }} />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center max-w-md w-full">
                {/* Logo */}
                <div className="mb-8 text-center">
                    <div className="text-7xl mb-4 animate-bounce-slow">💬</div>
                    <h1 className="text-5xl md:text-6xl font-black tracking-tighter mb-3 text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-fuchsia-100 to-rose-200 animate-text-shimmer">
                        Rizz Master
                    </h1>
                    <p className="text-white/60 text-sm font-medium">Your AI Dating Wingman</p>
                </div>

                {/* Features */}
                <div className="space-y-3 mb-8 w-full">
                    {[
                        { icon: '⚡', text: 'AI-Powered Replies' },
                        { icon: '🎯', text: '3 Unique Styles' },
                        { icon: '📸', text: 'Image Analysis' },
                        { icon: '✨', text: 'Perfect Bio Generator' },
                    ].map((feature, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 glass p-4 rounded-2xl border border-white/10 animate-fade-in-up"
                            style={{ animationDelay: `${i * 0.1}s` }}
                        >
                            <span className="text-2xl">{feature.icon}</span>
                            <span className="text-sm font-bold text-white/80">{feature.text}</span>
                        </div>
                    ))}
                </div>

                {/* Login Button */}
                <button
                    onClick={handleGoogleLogin}
                    className="w-full py-4 rounded-2xl bg-white text-black font-black text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="currentColor"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    Continue with Google
                </button>

                <p className="text-white/30 text-[10px] text-center mt-4">
                    By continuing, you agree to our Terms & Privacy Policy
                </p>
            </div>
        </div>
    );
};

export default LoginPage;

import React from 'react';

type PageType = 'PRIVACY' | 'TERMS' | 'SUPPORT';

interface InfoPagesProps {
    page: PageType;
    onBack: () => void;
}

const InfoPages: React.FC<InfoPagesProps> = ({ page, onBack }) => {
    const renderContent = () => {
        switch (page) {
            case 'PRIVACY':
                return (
                    <>
                        <h1 className="text-3xl font-black mb-6">Privacy Policy</h1>
                        <div className="space-y-4 text-sm text-white/70 leading-relaxed">
                            <p>
                                <strong className="text-white">Last updated:</strong> January 2026
                            </p>
                            <p>
                                At Rizz Master, your privacy is our priority. This policy outlines how we collect,
                                use, and protect your information.
                            </p>

                            <h2 className="text-xl font-bold text-white mt-6 mb-2">Information We Collect</h2>
                            <p>
                                We collect information you provide directly, including your email address when you
                                sign in with Google OAuth. We also store your saved rizz messages and bio creations.
                            </p>

                            <h2 className="text-xl font-bold text-white mt-6 mb-2">How We Use Your Data</h2>
                            <ul className="list-disc list-inside space-y-2 ml-2">
                                <li>To provide and improve our AI-powered services</li>
                                <li>To manage your account and subscription</li>
                                <li>To send important updates about the service</li>
                                <li>To analyze usage patterns and optimize performance</li>
                            </ul>

                            <h2 className="text-xl font-bold text-white mt-6 mb-2">Data Security</h2>
                            <p>
                                We use industry-standard encryption and security measures to protect your data.
                                All data is stored securely using Supabase's infrastructure.
                            </p>

                            <h2 className="text-xl font-bold text-white mt-6 mb-2">Your Rights</h2>
                            <p>
                                You have the right to access, modify, or delete your personal data at any time.
                                Contact us at support@rizzmaster.app for assistance.
                            </p>
                        </div>
                    </>
                );

            case 'TERMS':
                return (
                    <>
                        <h1 className="text-3xl font-black mb-6">Terms of Service</h1>
                        <div className="space-y-4 text-sm text-white/70 leading-relaxed">
                            <p>
                                <strong className="text-white">Last updated:</strong> January 2026
                            </p>
                            <p>
                                By using Rizz Master, you agree to these terms. Please read them carefully.
                            </p>

                            <h2 className="text-xl font-bold text-white mt-6 mb-2">Acceptance of Terms</h2>
                            <p>
                                By accessing or using Rizz Master, you agree to be bound by these Terms of Service
                                and all applicable laws and regulations.
                            </p>

                            <h2 className="text-xl font-bold text-white mt-6 mb-2">Use License</h2>
                            <p>
                                We grant you a limited, non-exclusive, non-transferable license to use Rizz Master
                                for personal, non-commercial purposes.
                            </p>

                            <h2 className="text-xl font-bold text-white mt-6 mb-2">User Conduct</h2>
                            <ul className="list-disc list-inside space-y-2 ml-2">
                                <li>Use the service respectfully and ethically</li>
                                <li>Do not use AI-generated content to harass or harm others</li>
                                <li>Do not attempt to abuse or exploit the credit system</li>
                                <li>Do not share your account credentials</li>
                            </ul>

                            <h2 className="text-xl font-bold text-white mt-6 mb-2">Subscriptions</h2>
                            <p>
                                Premium subscriptions auto-renew unless canceled. You can cancel at any time
                                through your account settings. Refunds are subject to our refund policy.
                            </p>

                            <h2 className="text-xl font-bold text-white mt-6 mb-2">Limitation of Liability</h2>
                            <p>
                                Rizz Master is provided "as is" without warranties. We are not responsible for
                                how you use the AI-generated content or the outcomes of your interactions.
                            </p>
                        </div>
                    </>
                );

            case 'SUPPORT':
                return (
                    <>
                        <h1 className="text-3xl font-black mb-6">Support</h1>
                        <div className="space-y-6">
                            <div className="glass p-6 rounded-3xl border border-white/10">
                                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <span>📧</span> Contact Us
                                </h2>
                                <p className="text-sm text-white/70 mb-4">
                                    Have questions or need help? We're here for you!
                                </p>
                                <a
                                    href="mailto:support@rizzmaster.app"
                                    className="block w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 transition-all text-center font-bold text-sm"
                                >
                                    support@rizzmaster.app
                                </a>
                            </div>

                            <div className="glass p-6 rounded-3xl border border-white/10">
                                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <span>❓</span> FAQ
                                </h2>
                                <div className="space-y-4 text-sm">
                                    <div>
                                        <p className="font-bold text-white mb-1">How do credits work?</p>
                                        <p className="text-white/60">
                                            You get 5 free credits daily. Each generation costs 1 credit (2 with image).
                                            Premium users get unlimited generations.
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-white mb-1">How do I get more credits?</p>
                                        <p className="text-white/60">
                                            Watch a rewarded ad for +5 credits or upgrade to Premium for unlimited!
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-white mb-1">Can I cancel my subscription?</p>
                                        <p className="text-white/60">
                                            Yes! You can cancel anytime from your device's subscription settings.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="glass p-6 rounded-3xl border border-white/10">
                                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <span>💡</span> Tips
                                </h2>
                                <ul className="space-y-2 text-sm text-white/70">
                                    <li>• Provide context for better AI responses</li>
                                    <li>• Upload screenshots for personalized advice</li>
                                    <li>• Save your favorite responses for later</li>
                                    <li>• Choose the style that fits your personality</li>
                                </ul>
                            </div>
                        </div>
                    </>
                );
        }
    };

    return (
        <div className="w-full h-[100dvh] bg-[#020202] text-white overflow-y-auto custom-scrollbar">
            <div className="max-w-xl mx-auto p-6 pb-24">
                {/* Back Button */}
                <button
                    onClick={onBack}
                    className="mb-6 flex items-center gap-2 text-white/60 hover:text-white transition-all"
                >
                    <span className="text-xl">←</span>
                    <span className="text-sm font-bold">Back</span>
                </button>

                {renderContent()}
            </div>
        </div>
    );
};

export default InfoPages;

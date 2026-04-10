import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';

export const isNative = (): boolean => {
    return Capacitor.isNativePlatform();
};

export const initializeNativeFeatures = () => {
    if (isNative()) {
        console.log('✅ Running on native platform:', Capacitor.getPlatform());
    } else {
        console.log('🌐 Running on web platform');
    }
};

export const selectImageNative = async (): Promise<string | null> => {
    try {
        const image = await Camera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.DataUrl,
            source: CameraSource.Photos,
        });
        return image.dataUrl || null;
    } catch (error) {
        console.error('Image selection failed:', error);
        return null;
    }
};

export const shareNative = async (text: string, title?: string): Promise<void> => {
    try {
        if (isNative()) {
            await Share.share({
                title: title || 'Rizz Master',
                text: text,
            });
        } else {
            // Web fallback - use Web Share API if available
            if (navigator.share) {
                await navigator.share({
                    title: title || 'Rizz Master',
                    text: text,
                });
            } else {
                // Fallback to clipboard
                await copyToClipboard(text);
                alert('Copied to clipboard!');
            }
        }
    } catch (error) {
        console.error('Share failed:', error);
    }
};

export const copyToClipboard = async (text: string): Promise<void> => {
    try {
        if (isNative()) {
            await Clipboard.write({ string: text });
        } else {
            await navigator.clipboard.writeText(text);
        }
    } catch (error) {
        console.error('Clipboard write failed:', error);
    }
};

export const showRewardedAdNative = async (): Promise<boolean> => {
    // Placeholder for AdMob integration
    // In production, you would integrate with Capacitor AdMob plugin
    console.log('🎬 Showing rewarded ad...');

    // Simulate ad loading and completion
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Return true if ad was watched successfully
    return true;
};

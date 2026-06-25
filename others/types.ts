export type Category = 'Bible' | 'Worship' | 'General';
export type LayoutType = 'Fullscreen' | 'Lower Third';
export type BackgroundType = 'Transparent' | 'Solid Color' | 'Gradient' | 'Image' | 'Video' | 'Pattern';
export type TextTransform = 'Uppercase' | 'Title Case' | 'Sentence Case';
export type VerticalAlignment = 'Top' | 'Center' | 'Bottom';
export type HorizontalAlignment = 'Left' | 'Center' | 'Right';
export type FontWeight = 'Light' | 'Regular' | 'Medium' | 'Bold' | 'Extra Bold';
export type Easing = 'Linear' | 'Ease' | 'Ease In' | 'Ease Out' | 'Ease In Out';
export type AnimationType = 'None' | 'Fade' | 'Slide Left' | 'Slide Right' | 'Slide Up' | 'Slide Down' | 'Zoom' | 'Scale' | 'Blur' | 'Bounce';
export type ImageFit = 'Fit' | 'Fill' | 'Stretch' | 'Tile';
export type GradientDirection = 'Top to Bottom' | 'Bottom to Top' | 'Left to Right' | 'Right to Left' | 'Diagonal';

export interface Theme {
    id: string;
    name: string;
    category: Category;
    layout: LayoutType;
    description: string;
    tags: string[];
    author: string;
    notes: string;
    favorited: boolean;

    typography: {
        headingFont: string;
        bodyFont: string;
        referenceFont: string;
        headingSize: number;
        bodySize: number;
        referenceSize: number;
        translationSize: number;
        verseNumberSize: number;
        headingWeight: FontWeight;
        bodyWeight: FontWeight;
        referenceWeight: FontWeight;
        headingColor: string;
        bodyColor: string;
        referenceColor: string;
        translationColor: string;
        verseNumberColor: string;
        shadow: boolean;
        outline: boolean;
        glow: boolean;
        opacity: number;
        blur: number;
        lineHeight: number;
        letterSpacing: number;
        textTransform: TextTransform;
        textAlignment: HorizontalAlignment;
    };

    background: {
        type: BackgroundType;
        solidColor: string;
        gradientStart: string;
        gradientEnd: string;
        gradientDirection: GradientDirection;
        image: string;
        imageFit: ImageFit;
        brightness: number;
        overlayColor: string;
        overlayOpacity: number;
        blur: number;
        videoUrl: string;
        videoLoop: boolean;
        videoMute: boolean;
        pattern: string;
        patternScale: number;
        cornerRadius: number;
        border: boolean;
        borderColor: string;
        shadow: boolean;
    };

    layoutSettings: {
        contentWidth: number;
        maxWidth: number;
        paddingTop: number;
        paddingBottom: number;
        paddingLeft: number;
        paddingRight: number;
        verticalAlignment: VerticalAlignment;
        horizontalAlignment: HorizontalAlignment;
        safeArea: boolean;
        referencePosition: HorizontalAlignment;
        textContainerWidth: number;
        stackDirection: 'Vertical' | 'Horizontal';
        spacing: number;
    };

    bibleSettings: {
        showReference: boolean;
        referencePosition: 'Above Verse' | 'Below Verse' | 'Inline';
        referenceStyle: string;
        showTranslation: boolean;
        translationPosition: 'Beside Reference' | 'Below Reference' | 'Hidden';
        showVerseNumber: boolean;
        verseNumberStyle: 'Before Verse' | 'Superscript' | 'Hidden';
        multiVerseBehavior: 'Paragraph' | 'Each Verse New Line' | 'Verse Blocks';
        referenceAlignment: HorizontalAlignment;
        referenceColor: string;
        referenceSize: number;
        referenceWeight: FontWeight;
    };

    worshipSettings: {
        showSongTitle: boolean;
        songTitlePosition: 'Top' | 'Bottom' | 'Hidden';
        showChorusLabel: boolean;
        labelStyle: string;
        slideBreak: 'Automatic' | 'Manual';
        maxLines: number;
        maxCharacters: number;
        keepChorusTogether: boolean;
        textAlignment: HorizontalAlignment;
    };

    animationSettings: {
        animateIn: AnimationType;
        animateOut: AnimationType;
        duration: number;
        delay: number;
        easing: Easing;
        loop: boolean;
    };
}

export const defaultThemes: Theme[] = [
    {
        id: '1',
        name: 'Selah',
        category: 'Bible',
        layout: 'Fullscreen',
        description: 'A clean and elegant theme for scripture and verses.',
        tags: ['Classic', 'Elegant'],
        author: '',
        notes: '',
        favorited: true,
        typography: {
            headingFont: 'Cormorant Garamond',
            bodyFont: 'Poppins',
            referenceFont: 'Poppins',
            headingSize: 96,
            bodySize: 40,
            referenceSize: 28,
            translationSize: 24,
            verseNumberSize: 20,
            headingWeight: 'Bold',
            bodyWeight: 'Regular',
            referenceWeight: 'Medium',
            headingColor: '#FFFFFF',
            bodyColor: '#FFFFFF',
            referenceColor: '#FFC107',
            translationColor: '#FFC107',
            verseNumberColor: '#FFC107',
            shadow: true,
            outline: false,
            glow: false,
            opacity: 100,
            blur: 0,
            lineHeight: 1.1,
            letterSpacing: 0,
            textTransform: 'Sentence Case',
            textAlignment: 'Center',
        },
        background: {
            type: 'Image',
            solidColor: '#000000',
            gradientStart: '#000000',
            gradientEnd: '#1a1a2e',
            gradientDirection: 'Top to Bottom',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCRGvmZiIUJ2ChMkflwS4rJ5GIIoKU-rDAORwpqjsm9a2i7lEMyn9C_W1Xu2JrDEMcAfLQq3VQFsQMPfuB2GgEs2zyYLBZoGNmFFkhvfefZTk_EHGk6sgpvnyfQo87fiGwRxnjbZ1Mm48L69HjsyM5FbNpLaljuEdL2WL4R3_R6385Er_78jIAEvwtXEJdINmdkHFgjDGipmgt7p4l8yRGYXWaPq5x7lD1RNngCRt2JTZeSJI2BgwqR3EyvOjqSaiS5zbl1qmgCUP13',
            imageFit: 'Fill',
            brightness: 70,
            overlayColor: '#000000',
            overlayOpacity: 40,
            blur: 0,
            videoUrl: '',
            videoLoop: true,
            videoMute: true,
            pattern: '',
            patternScale: 1,
            cornerRadius: 0,
            border: false,
            borderColor: '#FFFFFF',
            shadow: false,
        },
        layoutSettings: {
            contentWidth: 90,
            maxWidth: 1200,
            paddingTop: 80,
            paddingBottom: 80,
            paddingLeft: 80,
            paddingRight: 80,
            verticalAlignment: 'Center',
            horizontalAlignment: 'Center',
            safeArea: true,
            referencePosition: 'Center',
            textContainerWidth: 80,
            stackDirection: 'Vertical',
            spacing: 16,
        },
        bibleSettings: {
            showReference: true,
            referencePosition: 'Above Verse',
            referenceStyle: 'Genesis 1:1 (NIV)',
            showTranslation: true,
            translationPosition: 'Beside Reference',
            showVerseNumber: false,
            verseNumberStyle: 'Before Verse',
            multiVerseBehavior: 'Paragraph',
            referenceAlignment: 'Center',
            referenceColor: '#FFC107',
            referenceSize: 28,
            referenceWeight: 'Medium',
        },
        worshipSettings: {
            showSongTitle: false,
            songTitlePosition: 'Top',
            showChorusLabel: true,
            labelStyle: 'CHORUS',
            slideBreak: 'Automatic',
            maxLines: 4,
            maxCharacters: 45,
            keepChorusTogether: true,
            textAlignment: 'Center',
        },
        animationSettings: {
            animateIn: 'Fade',
            animateOut: 'Fade',
            duration: 0.6,
            delay: 0,
            easing: 'Ease In Out',
            loop: false,
        },
    },
    {
        id: '2',
        name: 'Eden',
        category: 'Worship',
        layout: 'Fullscreen',
        description: 'Vibrant and energetic worship theme.',
        tags: ['Modern', 'Minimal'],
        author: '',
        notes: '',
        favorited: false,
        typography: {
            headingFont: 'Poppins',
            bodyFont: 'Poppins',
            referenceFont: 'Poppins',
            headingSize: 84,
            bodySize: 32,
            referenceSize: 24,
            translationSize: 20,
            verseNumberSize: 18,
            headingWeight: 'Bold',
            bodyWeight: 'Regular',
            referenceWeight: 'Medium',
            headingColor: '#FFFFFF',
            bodyColor: '#FFFFFF',
            referenceColor: '#FFDF9E',
            translationColor: '#FFDF9E',
            verseNumberColor: '#FFDF9E',
            shadow: true,
            outline: false,
            glow: false,
            opacity: 100,
            blur: 0,
            lineHeight: 1.15,
            letterSpacing: 0,
            textTransform: 'Uppercase',
            textAlignment: 'Center',
        },
        background: {
            type: 'Image',
            solidColor: '#000000',
            gradientStart: '#000000',
            gradientEnd: '#1a1a2e',
            gradientDirection: 'Top to Bottom',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAKIMjZ4_NcPS4JVRWhj7IzqSPlJw_qBdmUvpWIbPNbD7q-Vy9flPxDyWTuEm3z1sIzSP9VzPhjFEQodkgqum6nDG3E0JJ8DLdRBDrpyag_-2piMoDUAnNL35XumPKWtQS1LVlSd17KqnarRO94HVkKl1KfEJrAROEXHvzWmBwzd2v06MXNdTgLgplBaLgbKas8alLlb4pqw735-iARDrBOc6_b8uJjuraoRyFsaon4DF7h6KrGlVUlDiAIy6kbvovElxVf0gGVEAmk',
            imageFit: 'Fill',
            brightness: 80,
            overlayColor: '#000000',
            overlayOpacity: 50,
            blur: 2,
            videoUrl: '',
            videoLoop: true,
            videoMute: true,
            pattern: '',
            patternScale: 1,
            cornerRadius: 0,
            border: false,
            borderColor: '#FFFFFF',
            shadow: false,
        },
        layoutSettings: {
            contentWidth: 90,
            maxWidth: 1400,
            paddingTop: 40,
            paddingBottom: 80,
            paddingLeft: 40,
            paddingRight: 40,
            verticalAlignment: 'Center',
            horizontalAlignment: 'Center',
            safeArea: true,
            referencePosition: 'Center',
            textContainerWidth: 85,
            stackDirection: 'Vertical',
            spacing: 12,
        },
        bibleSettings: {
            showReference: true,
            referencePosition: 'Above Verse',
            referenceStyle: 'Genesis 1:1',
            showTranslation: true,
            translationPosition: 'Beside Reference',
            showVerseNumber: true,
            verseNumberStyle: 'Superscript',
            multiVerseBehavior: 'Paragraph',
            referenceAlignment: 'Center',
            referenceColor: '#FFDF9E',
            referenceSize: 24,
            referenceWeight: 'Medium',
        },
        worshipSettings: {
            showSongTitle: false,
            songTitlePosition: 'Top',
            showChorusLabel: true,
            labelStyle: 'CHORUS',
            slideBreak: 'Automatic',
            maxLines: 4,
            maxCharacters: 50,
            keepChorusTogether: true,
            textAlignment: 'Center',
        },
        animationSettings: {
            animateIn: 'Slide Up',
            animateOut: 'Fade',
            duration: 0.8,
            delay: 0,
            easing: 'Ease Out',
            loop: false,
        },
    },
];

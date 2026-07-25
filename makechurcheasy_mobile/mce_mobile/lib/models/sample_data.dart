class SceneData {
  final String id;
  final String name;
  final String? status; // 'preview', 'live', or null

  const SceneData({required this.id, required this.name, this.status});
}

class MacroData {
  final String id;
  final String name;
  final String icon;

  const MacroData({required this.id, required this.name, required this.icon});
}

class RuleData {
  final String id;
  final String title;
  final String description;
  bool enabled;

  RuleData({
    required this.id,
    required this.title,
    required this.description,
    this.enabled = true,
  });
}

class MacroExecution {
  final String name;
  final String time;

  const MacroExecution({required this.name, required this.time});
}

class BibleVerse {
  final String reference;
  final String text;
  bool selected;

  BibleVerse({required this.reference, required this.text, this.selected = false});
}

class VerseAIItem {
  final String verse;
  final String preview;

  const VerseAIItem({required this.verse, required this.preview});
}

class VerseHistoryItem {
  final String reference;
  final String action;
  final String time;

  const VerseHistoryItem({
    required this.reference,
    required this.action,
    required this.time,
  });
}

class SongSlide {
  final int number;
  final String text;

  const SongSlide({required this.number, required this.text});
}

class SongData {
  final String id;
  final String title;
  final String artist;
  final List<SongSlide> slides;

  const SongData({
    required this.id,
    required this.title,
    required this.artist,
    required this.slides,
  });
}

class TickerItem {
  final String text;
  bool selected;

  TickerItem({required this.text, this.selected = false});
}

class LowerThirdSlot {
  final String title;
  final String subtitle;
  final bool active;

  const LowerThirdSlot({
    required this.title,
    required this.subtitle,
    this.active = false,
  });
}

class MediaItem {
  final String id;
  final String name;
  final String type; // 'image', 'video', 'animation'

  const MediaItem({required this.id, required this.name, required this.type});
}

// --- Sample Data ---

const List<SceneData> sampleScenes = [
  SceneData(id: 's1', name: 'Main Stage', status: 'live'),
  SceneData(id: 's2', name: 'Worship View', status: 'preview'),
  SceneData(id: 's3', name: 'Sermon Close', status: null),
  SceneData(id: 's4', name: 'Baptism', status: null),
];

const List<MacroData> sampleMacros = [
  MacroData(id: 'm1', name: 'Start Service', icon: 'play_circle'),
  MacroData(id: 'm2', name: 'End Service', icon: 'stop_circle'),
  MacroData(id: 'm3', name: 'Baptism Mode', icon: 'water_drop'),
  MacroData(id: 'm4', name: 'Offering', icon: 'volunteer_activism'),
  MacroData(id: 'm5', name: 'Announcements', icon: 'campaign'),
  MacroData(id: 'm6', name: 'Communion', icon: 'local_drink'),
];

final List<RuleData> sampleRules = [
  RuleData(
    id: 'r1',
    title: 'Auto Scene on Worship',
    description: 'Switch to Worship scene when worship songs begin playing.',
    enabled: true,
  ),
  RuleData(
    id: 'r2',
    title: 'Lower Third on Sermon',
    description: 'Show speaker lower third when sermon video starts.',
    enabled: false,
  ),
  RuleData(
    id: 'r3',
    title: 'End Stream at Midnight',
    description: 'Automatically stop streaming at 12:00 AM.',
    enabled: true,
  ),
  RuleData(
    id: 'r4',
    title: 'Record on Live',
    description: 'Start recording whenever live streaming begins.',
    enabled: true,
  ),
];

final List<MacroExecution> sampleExecutions = [
  MacroExecution(name: 'Start Service', time: '2 min ago'),
  MacroExecution(name: 'End Service', time: '1 hr ago'),
  MacroExecution(name: 'Baptism Mode', time: '3 hr ago'),
  MacroExecution(name: 'Offering', time: '5 hr ago'),
  MacroExecution(name: 'Start Service', time: 'Yesterday'),
];

final List<BibleVerse> sampleVerses = [
  BibleVerse(
    reference: 'John 3:16',
    text: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
    selected: true,
  ),
  BibleVerse(
    reference: 'Psalm 23:1',
    text: 'The Lord is my shepherd, I lack nothing.',
  ),
  BibleVerse(
    reference: 'Romans 8:28',
    text: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.',
  ),
  BibleVerse(
    reference: 'Philippians 4:13',
    text: 'I can do all this through him who gives me strength.',
  ),
  BibleVerse(
    reference: 'Isaiah 40:31',
    text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.',
  ),
  BibleVerse(
    reference: 'Proverbs 3:5-6',
    text: 'Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.',
  ),
];

const List<VerseAIItem> sampleVerseAI = [
  VerseAIItem(verse: 'John 14:27', preview: 'Peace I leave with you...'),
  VerseAIItem(verse: 'Matthew 11:28', preview: 'Come to me, all you who are weary...'),
  VerseAIItem(verse: '2 Timothy 1:7', preview: 'For the Spirit God gave us...'),
];

const List<VerseHistoryItem> sampleVerseHistory = [
  VerseHistoryItem(reference: 'John 3:16', action: 'Pushed to Live', time: '5 min ago'),
  VerseHistoryItem(reference: 'Psalm 23:1', action: 'Previewed', time: '12 min ago'),
  VerseHistoryItem(reference: 'Romans 8:28', action: 'Pushed to Live', time: '1 hr ago'),
];

const List<SongData> sampleWorshipLibrary = [
  SongData(
    id: 'w1',
    title: 'Amazing Grace',
    artist: 'John Newton',
    slides: [
      SongSlide(number: 1, text: 'Amazing grace how sweet the sound\nThat saved a wretch like me\nI once was lost, but now I am found\nWas blind, but now I see'),
      SongSlide(number: 2, text: "'Twas grace that taught my heart to fear\nAnd grace my fears relieved\nHow precious did that grace appear\nThe hour I first believed"),
      SongSlide(number: 3, text: "Through many dangers, toils, and snares\nI have already come\n'Tis grace hath brought me safe thus far\nAnd grace will lead me home"),
    ],
  ),
  SongData(
    id: 'w2',
    title: 'How Great Is Our God',
    artist: 'Chris Tomlin',
    slides: [
      SongSlide(number: 1, text: 'The splendor of the King\nClothed in majesty\nLet all the earth rejoice\nAll the earth rejoice'),
      SongSlide(number: 2, text: 'He wraps Himself in light\nAnd darkness tries to hide\nAnd trembles at His voice\nTrembles at His voice'),
      SongSlide(number: 3, text: 'How great is our God\nSing with me\nHow great is our God\nAnd all will see\nHow great, how great\nIs our God'),
    ],
  ),
  SongData(
    id: 'w3',
    title: 'Oceans',
    artist: 'Hillsong United',
    slides: [
      SongSlide(number: 1, text: 'You call me out upon the waters\nThe great unknown where feet may fail\nAnd there I find You in the mystery\nIn oceans deep my faith will stand'),
      SongSlide(number: 2, text: 'Spirit lead me where my trust is without borders\nLet me walk upon the waters\nWhenever You would call me'),
    ],
  ),
  SongData(
    id: 'w4',
    title: 'Good Good Father',
    artist: 'Chris Tomlin',
    slides: [
      SongSlide(number: 1, text: "Oh, and I've heard a thousand stories\nOf what they think You're like\nAnd I've heard the tender whisper\nOf love in the dead of night"),
      SongSlide(number: 2, text: "You're a good, good Father\nIt's who You are\nIt's who You are\nIt's who You are\nAnd I'm loved by You\nIt's who I am\nIt's who I am\nIt's who I am"),
    ],
  ),
  SongData(
    id: 'w5',
    title: 'What A Beautiful Name',
    artist: 'Hillsong Worship',
    slides: [
      SongSlide(number: 1, text: 'You were the Word at the beginning\nOne with God the Lord Most High\nYour hidden glory in creation\nNow revealed in You our Christ'),
      SongSlide(number: 2, text: 'What a beautiful Name it is\nWhat a beautiful Name it is\nThe Name of Jesus Christ my King\nWhat a beautiful Name it is\nNothing compares to this'),
    ],
  ),
  SongData(
    id: 'w6',
    title: 'Great Are You Lord',
    artist: 'All Sons & Daughters',
    slides: [
      SongSlide(number: 1, text: 'You give life, You are love\nYou bring light to the darkness\nYou give hope, You restore\nEvery heart that is broken'),
      SongSlide(number: 2, text: "Great are You Lord\nIt's Your breath in our lungs\nSo we pour out our praise\nWe pour out our praise\nIt's Your breath in our lungs\nSo we pour out our praise to You only"),
    ],
  ),
];

final List<TickerItem> sampleTickerItems = [
  TickerItem(text: 'Welcome to Grace Community Church!', selected: true),
  TickerItem(text: 'Bible Study every Wednesday at 7 PM'),
  TickerItem(text: 'Youth Group meets Friday at 6 PM'),
  TickerItem(text: 'Women\'s Prayer Meeting Saturday 9 AM'),
  TickerItem(text: 'Annual Church Picnic - Next Sunday'),
];

const List<LowerThirdSlot> sampleLowerThirdSlots = [
  LowerThirdSlot(title: 'Pastor John Smith', subtitle: 'Senior Pastor', active: true),
  LowerThirdSlot(title: 'Worship Team', subtitle: 'Leading Worship', active: false),
  LowerThirdSlot(title: 'Guest Speaker', subtitle: '', active: false),
];

const List<MediaItem> sampleMediaItems = [
  MediaItem(id: 'med1', name: 'Church Banner', type: 'image'),
  MediaItem(id: 'med2', name: 'Sermon Series', type: 'image'),
  MediaItem(id: 'med3', name: 'Welcome Loop', type: 'video'),
  MediaItem(id: 'med4', name: 'Countdown Timer', type: 'video'),
  MediaItem(id: 'med5', name: 'Logo Reveal', type: 'animation'),
  MediaItem(id: 'med6', name: 'Light Rays', type: 'animation'),
  MediaItem(id: 'med7', name: 'Cross Background', type: 'image'),
  MediaItem(id: 'med8', name: 'Baptism B-Roll', type: 'video'),
];

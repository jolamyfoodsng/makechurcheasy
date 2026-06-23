/**
 * Bible story engine — maps story aliases to scripture passages.
 */

export interface StoryEntry {
  story: string;
  references: string[];
  aliases: string[];
}

export const STORY_ENGINE: StoryEntry[] = [
  {
    story: "Jonah and the whale",
    references: ["Jonah 1:17", "Jonah 2:1", "Jonah 2:2", "Jonah 2:10"],
    aliases: ["fish", "whale", "swallowed", "great fish", "belly", "three days", "three nights", "jonah"],
  },
  {
    story: "David and Goliath",
    references: ["1 Samuel 17:4", "1 Samuel 17:45", "1 Samuel 17:46", "1 Samuel 17:49", "1 Samuel 17:50"],
    aliases: ["goliath", "giant", "sling", "stone", "five stones", "philistine", "david"],
  },
  {
    story: "Daniel in the lion's den",
    references: ["Daniel 6:10", "Daniel 6:16", "Daniel 6:21", "Daniel 6:22", "Daniel 6:23"],
    aliases: ["lion", "lions", "den", "daniel", "angel", "shut the mouths"],
  },
  {
    story: "Shadrach Meshach and Abednego in the fiery furnace",
    references: ["Daniel 3:17", "Daniel 3:18", "Daniel 3:25", "Daniel 3:26", "Daniel 3:27"],
    aliases: ["furnace", "fire", "burned", "fourth man", "shadrach", "meshach", "abednego", "fiery"],
  },
  {
    story: "Moses and the Red Sea",
    references: ["Exodus 14:21", "Exodus 14:22", "Exodus 14:29", "Exodus 14:30", "Exodus 14:31"],
    aliases: ["red sea", "parted", "waters", "pharaoh", "egypt", "moses", "dry ground"],
  },
  {
    story: "The ten commandments",
    references: ["Exodus 20:1", "Exodus 20:2", "Exodus 20:3", "Exodus 20:4", "Exodus 20:5", "Exodus 20:6", "Exodus 20:7", "Exodus 20:8", "Exodus 20:9", "Exodus 20:10", "Exodus 20:11", "Exodus 20:12", "Exodus 20:13", "Exodus 20:14", "Exodus 20:15", "Exodus 20:16", "Exodus 20:17"],
    aliases: ["commandments", "ten commandments", "stone tablets", "moses", "sinai", "mountain"],
  },
  {
    story: "The burning bush",
    references: ["Exodus 3:2", "Exodus 3:3", "Exodus 3:4", "Exodus 3:5", "Exodus 3:6"],
    aliases: ["bush", "burning", "fire", "holy ground", "moses", "take off your shoes"],
  },
  {
    story: "Noah and the ark",
    references: ["Genesis 6:9", "Genesis 7:1", "Genesis 7:17", "Genesis 8:1", "Genesis 9:13"],
    aliases: ["ark", "flood", "rain", "noah", "animals", "dove", "rainbow", "forty days"],
  },
  {
    story: "The fall of man",
    references: ["Genesis 3:1", "Genesis 3:6", "Genesis 3:7", "Genesis 3:15", "Genesis 3:19"],
    aliases: ["eden", "garden", "serpent", "apple", "forbidden fruit", "tree of knowledge", "eve", "adam", "fall"],
  },
  {
    story: "Abraham and Isaac",
    references: ["Genesis 22:1", "Genesis 22:2", "Genesis 22:8", "Genesis 22:13", "Genesis 22:14"],
    aliases: ["sacrifice", "isaac", "abraham", "ram", "altar", "only son", "provide"],
  },
  {
    story: "Joseph and his brothers",
    references: ["Genesis 37:3", "Genesis 37:23", "Genesis 37:28", "Genesis 45:1", "Genesis 45:3", "Genesis 50:20"],
    aliases: ["joseph", "coat", "many colors", "coat of many colors", "brothers", "pit", "sold", "egypt"],
  },
  {
    story: "The prodigal son",
    references: ["Luke 15:11", "Luke 15:12", "Luke 15:13", "Luke 15:20", "Luke 15:21", "Luke 15:22", "Luke 15:23", "Luke 15:24"],
    aliases: ["prodigal", "son", "father", "lost", "returned", "fattened calf", "robe", "ring"],
  },
  {
    story: "The good samaritan",
    references: ["Luke 10:30", "Luke 10:31", "Luke 10:32", "Luke 10:33", "Luke 10:34", "Luke 10:35", "Luke 10:36", "Luke 10:37"],
    aliases: ["samaritan", "robbers", "beaten", "inn", "neighbor", "passed by", "priest", "levite"],
  },
  {
    story: "The feeding of the five thousand",
    references: ["Matthew 14:15", "Matthew 14:16", "Matthew 14:17", "Matthew 14:18", "Matthew 14:19", "Matthew 14:20", "Matthew 14:21"],
    aliases: ["five thousand", "loaves", "fishes", "bread", "multitude", "feeding", "twelve baskets"],
  },
  {
    story: "Jesus calms the storm",
    references: ["Mark 4:35", "Mark 4:36", "Mark 4:37", "Mark 4:38", "Mark 4:39", "Mark 4:40", "Mark 4:41"],
    aliases: ["storm", "wind", "waves", "sea", "calm", "peace be still", "quiet", "boat"],
  },
  {
    story: "The crucifixion",
    references: ["Matthew 27:35", "Matthew 27:38", "Matthew 27:45", "Matthew 27:46", "Matthew 27:50", "Matthew 27:51", "Matthew 27:54"],
    aliases: ["cross", "crucified", "golgotha", "calvary", "nails", "blood", "died", "darkness", "veil torn"],
  },
  {
    story: "The resurrection",
    references: ["Matthew 28:1", "Matthew 28:2", "Matthew 28:5", "Matthew 28:6", "Matthew 28:7"],
    aliases: ["empty tomb", "risen", "raised", "resurrection", "stone rolled", "angel", "not here", "easter"],
  },
  {
    story: "The last supper",
    references: ["Matthew 26:17", "Matthew 26:20", "Matthew 26:26", "Matthew 26:27", "Matthew 26:28", "Matthew 26:29"],
    aliases: ["supper", "bread", "wine", "cup", "body", "blood", "communion", "remembrance", "passover"],
  },
  {
    story: "Peter walks on water",
    references: ["Matthew 14:25", "Matthew 14:26", "Matthew 14:27", "Matthew 14:28", "Matthew 14:29", "Matthew 14:30", "Matthew 14:31"],
    aliases: ["walk", "water", "waves", "peter", "sinking", "faith", "doubt", "boat"],
  },
  {
    story: "The woman at the well",
    references: ["John 4:7", "John 4:10", "John 4:13", "John 4:14", "John 4:25", "John 4:26", "John 4:29"],
    aliases: ["well", "samaritan", "woman", "living water", "thirst", "drink", "jacobs well"],
  },
  {
    story: "Paul and Silas in prison",
    references: ["Acts 16:23", "Acts 16:24", "Acts 16:25", "Acts 16:26", "Acts 16:27", "Acts 16:31"],
    aliases: ["prison", "chains", "singing", "earthquake", "doors opened", "jailer", "paul", "silas"],
  },
  {
    story: "The tower of Babel",
    references: ["Genesis 11:1", "Genesis 11:4", "Genesis 11:5", "Genesis 11:6", "Genesis 11:7", "Genesis 11:8", "Genesis 11:9"],
    aliases: ["babel", "tower", "language", "tongues", "confused", "scattered"],
  },
  {
    story: "The walls of Jericho",
    references: ["Joshua 6:1", "Joshua 6:4", "Joshua 6:5", "Joshua 6:15", "Joshua 6:16", "Joshua 6:20"],
    aliases: ["jericho", "walls", "fall", "trumpet", "march", "seven times", "shout"],
  },
  {
    story: "Ruth and Naomi",
    references: ["Ruth 1:16", "Ruth 1:17"],
    aliases: ["ruth", "naomi", "where you go", "your people", "my people", "loyal", "gleaning"],
  },
  {
    story: "Samson and Delilah",
    references: ["Judges 16:17", "Judges 16:20", "Judges 16:21", "Judges 16:25", "Judges 16:28", "Judges 16:29", "Judges 16:30"],
    aliases: ["samson", "delilah", "hair", "strength", "pillars", "eyes", "philistines"],
  },
  {
    story: "Elijah and the prophets of Baal",
    references: ["1 Kings 18:21", "1 Kings 18:24", "1 Kings 18:30", "1 Kings 18:36", "1 Kings 18:37", "1 Kings 18:38", "1 Kings 18:39"],
    aliases: ["elijah", "baal", "fire from heaven", "altars", "prophets", "carmel", "water"],
  },
  {
    story: "The raising of Lazarus",
    references: ["John 11:11", "John 11:14", "John 11:17", "John 11:23", "John 11:25", "John 11:39", "John 11:43", "John 11:44"],
    aliases: ["lazarus", "raised", "dead", "tomb", "four days", "come forth", "unbound", "sleeping"],
  },
  {
    story: "The nativity / birth of Jesus",
    references: ["Luke 2:7", "Luke 2:10", "Luke 2:11", "Luke 2:12", "Luke 2:13", "Luke 2:14", "Luke 2:15", "Luke 2:16"],
    aliases: ["bethlehem", "manger", "swaddling", "shepherds", "angel", "good tidings", "born", "christmas"],
  },
];

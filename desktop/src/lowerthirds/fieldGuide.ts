/**
 * fieldGuide.ts
 *
 * Plain-language headings and hints for the text boxes of a lower-third or
 * broadcast graphic. Many designs only name their boxes "Label 1", "Small name",
 * "Title" and so on, which does not tell anyone what to type. This gives every
 * box a clear heading and a one-line example.
 */

export interface FieldGuideInput {
  key: string;
  label?: string;
  type?: string;
}

export interface FieldGuide {
  heading: string;
  hint: string;
}

function guide(heading: string, hint: string): FieldGuide {
  return { heading, hint };
}

export function describeField(variable: FieldGuideInput): FieldGuide {
  const key = String(variable.key || "").trim();
  const keyL = key.toLowerCase();
  const label = String(variable.label || key).replace(/\s*\(comma list\)/i, "").trim() || key;
  const labelL = label.toLowerCase();

  // Item rows on giving / information graphics: "Item 2 – label", "Item 2 – detail"
  const item = /^item (\d+)\s*[–-]\s*(label|detail|icon|line 1|line 2)$/i.exec(label);
  if (item) {
    const n = item[1];
    const part = item[2].toLowerCase();
    if (part === "label") return guide(`Item ${n} name`, "A short name for this item, such as Bank transfer or Cash App.");
    if (part === "detail") return guide(`Item ${n} detail`, "The detail that goes with it, such as an account number, handle or link.");
    if (part === "line 1") return guide(`Item ${n}, first line`, "The first line of text for this item.");
    if (part === "line 2") return guide(`Item ${n}, second line`, "The second line, shown under the first.");
    return guide(`Item ${n} icon`, "The icon shown next to this item.");
  }

  // Boxes that are only numbered or vaguely named
  if (/^label (1|line 1)$/i.test(label)) {
    return guide("Small line 1", "A short line of small text beside the name, such as SENIOR PASTOR.");
  }
  if (/^label (2|line 2)$/i.test(label)) {
    return guide("Small line 2", "A second short line of small text, such as your church name or city.");
  }
  if (labelL === "label") {
    return guide("Small label", "A short label shown with the name, such as your church name or city.");
  }
  if (labelL === "small name") {
    return guide("Small name (first name)", "The smaller part of the name, usually the first name. The rest goes in Big name.");
  }
  if (labelL === "big name") {
    return guide("Big name (last name)", "The larger part of the name, usually the last name.");
  }

  // By what the box is for
  if (keyL === "firstname") {
    if (/full name/i.test(label)) return guide(label, "The speaker's full name, such as Pastor Grace Okafor.");
    return guide(label, "The first or smaller part of the name. The rest of the name goes in the next box.");
  }
  if (keyL === "lastname") {
    return guide(label, "The last or larger part of the name.");
  }
  if (["name", "fullname", "speakername", "pastorname", "ministername"].includes(keyL)) {
    return guide(label, "The speaker's name, such as Pastor Grace Okafor.");
  }
  if (keyL === "organization" || keyL === "church" || keyL === "churchname") {
    return guide(/^church/i.test(label) ? label : "Church name", "Your church's name.");
  }
  if (keyL === "title" || keyL === "role" || keyL === "position") {
    if (/main text/i.test(label)) return guide("Main text", "The main line of text on the graphic.");
    if (/button/i.test(label)) return guide("Button text", "The words on the button, such as SUBSCRIBE.");
    if (/^tag$/i.test(label)) return guide("Tag", "A short tag, such as LIVE or NEW.");
    if (/top line|bottom line/i.test(label)) return guide(label, "A line of text on the graphic.");
    return guide("Title or role", "The speaker's role, such as Senior Pastor or Guest Speaker.");
  }
  if (keyL === "heading") return guide("Heading", "The headline, such as WAYS TO GIVE.");
  if (keyL === "subtitle" || keyL === "sub") {
    if (/button/i.test(label)) return guide("Button text", "The words on the button, such as SUBSCRIBE.");
    return guide(label, "A smaller line of text under the heading.");
  }
  if (keyL === "info") return guide(label, "A line of details, such as service times.");
  if (keyL === "web") return guide(label, "Your website, such as www.yourchurch.com.");
  if (keyL === "pre") return guide(label, "The words before the website, such as Visit us at.");
  if (keyL === "phone") return guide(label, "A phone number people can call.");
  if (keyL === "media") return guide(label, "Your social media handle, such as @yourchurch.");
  if (keyL === "socials") return guide(label, "Tap the icons to show. They appear in the order you pick them.");

  // Stream graphics (Day Badge, Partnership + QR, News Ticker Bar, Live Bug)
  if (keyL === "daytext") return guide("Day tag", "The short tag on the left, such as DAY 1 or NIGHT 3.");
  if (keyL === "datetext") return guide("Date", "The date shown beside the tag, such as 12TH MAR. 2026. Leave empty to show only the tag.");
  if (keyL === "ptlabel") return guide("Heading", "The heading above the link, such as Partnership or Give.");
  if (keyL === "link" && /scan code/i.test(label)) return guide("Link", "Type your website address. It is shown on screen and the scan code opens exactly this link.");
  if (keyL === "note") return guide("Small line", "A small line under the link, such as Scan the code or visit the link. Leave empty to hide it.");
  if (keyL === "tickerlabel") return guide("Label", "The tab on the left of the bar, such as LATEST or NEWS.");
  if (keyL === "tickeritems") return guide("Messages", "One message per line. They scroll across the bar in a loop.");
  if (keyL === "livetext") return guide("Live pill text", "The words in the coloured pill, usually LIVE.");
  if (keyL === "hashtag") return guide("Hashtag", "Your hashtag, such as #SundayService. Leave empty to show only the LIVE pill.");

  return guide(label, "");
}

#!/usr/bin/env python3
"""
add_titles_v3.py — Safely adds title="..." to <button> elements.

Key improvement over v2: Properly extracts the VISIBLE text content of buttons
(text between > and </button>) instead of tag attributes for title generation.
"""

import re
import os

SRC_DIR = os.path.join(os.path.dirname(__file__), "..", "src")


# ── Title generation ────────────────────────────────────────────────────────

ICON_MAP = {
    "add": "Add", "add_circle": "Add", "add_circle_outline": "Add",
    "arrow_back": "Go back", "arrow_forward": "Go forward",
    "arrow_left": "Previous", "arrow_right": "Next",
    "attach_file": "Attach file", "auto_awesome": "Auto arrange",
    "backspace": "Backspace", "bookmark": "Bookmark",
    "build": "Repair", "calendar_today": "Calendar",
    "cancel": "Cancel", "check": "Confirm", "check_circle": "Confirm",
    "check_circle_outline": "Confirm", "chevron_left": "Previous",
    "chevron_right": "Next", "clear": "Clear", "close": "Close",
    "cloud_upload": "Upload", "code": "Code", "content_copy": "Copy",
    "content_paste": "Paste", "copy": "Copy", "create": "Edit",
    "delete": "Delete", "delete_outline": "Delete",
    "download": "Download", "drag_indicator": "Drag to reorder",
    "edit": "Edit", "emoji_emotions": "Emoji",
    "expand_less": "Collapse", "expand_more": "Expand",
    "extension": "Extensions", "file_copy": "Copy file",
    "filter_list": "Filter", "folder": "Folder",
    "folder_open": "Open folder", "fullscreen": "Fullscreen",
    "fullscreen_exit": "Exit fullscreen", "grid_view": "Grid view",
    "group": "Group", "help": "Help", "history": "History",
    "home": "Home", "hourglass_empty": "Processing",
    "image": "Image", "info": "Info", "key": "Key",
    "language": "Language", "link": "Link", "list": "List view",
    "lock": "Lock", "lock_open": "Unlock", "login": "Log in",
    "logout": "Log out", "menu": "Menu", "menu_book": "Book",
    "mic": "Microphone", "mic_off": "Mute microphone",
    "more_vert": "More options", "more_horiz": "More options",
    "movie": "Movie", "music_note": "Music",
    "navigate_before": "Previous", "navigate_next": "Next",
    "notifications": "Notifications",
    "notifications_off": "Mute notifications",
    "open_in_new": "Open in new tab", "palette": "Palette",
    "pause": "Pause", "pause_presentation": "Pause stream",
    "person": "Person", "play_arrow": "Play", "play_circle": "Play",
    "playlist_add": "Add to playlist",
    "power_settings_new": "Disconnect", "push_pin": "Pin",
    "radio_button_checked": "Select",
    "radio_button_unchecked": "Deselect", "refresh": "Refresh",
    "remove": "Remove", "remove_circle": "Remove", "repeat": "Repeat",
    "replay": "Replay", "resize": "Resize", "save": "Save",
    "search": "Search", "send": "Send", "settings": "Settings",
    "share": "Share", "shuffle": "Shuffle",
    "skip_next": "Skip next", "skip_previous": "Skip previous",
    "skip_forward": "Skip", "smart_display": "Smart display",
    "splitscreen": "Split screen", "subtitles": "Subtitles",
    "subtitles_off": "Hide subtitles", "swap_horiz": "Swap",
    "sync": "Sync", "text_fields": "Text", "timer": "Timer",
    "toggle_off": "Toggle off", "toggle_on": "Toggle on",
    "tune": "Settings", "undo": "Undo", "update": "Update",
    "upload": "Upload", "vertical_split": "Split ratio",
    "view_carousel": "Carousel view", "view_module": "Module view",
    "visibility": "Show", "visibility_off": "Hide",
    "volume_off": "Mute", "volume_up": "Unmute",
    "warning": "Warning", "widgets": "Widgets",
    "zoom_in": "Zoom in", "zoom_out": "Zoom out",
    "stop": "Stop", "stop_circle": "Stop",
    "fast_forward": "Fast forward", "fast_rewind": "Rewind",
    "replay_10": "Rewind 10s", "forward_10": "Forward 10s",
    "replay_5": "Rewind 5s", "forward_5": "Forward 5s",
    "play_pause": "Play/Pause", "picture_in_picture": "Picture in picture",
    "settings_brightness": "Brightness",
    "grid_on": "Grid overlay", "grid_off": "Hide grid overlay",
    "content_cut": "Trim",
}

# Lucide-react component name → title
LUCIDE_MAP = {
    "X": "Close", "Check": "Confirm", "Plus": "Add", "Minus": "Remove",
    "Search": "Search", "Filter": "Filter", "Settings": "Settings",
    "Save": "Save", "Edit": "Edit", "Trash2": "Delete", "Trash": "Delete",
    "Download": "Download", "Upload": "Upload", "Copy": "Copy",
    "RefreshCw": "Refresh", "RotateCcw": "Refresh",
    "ArrowLeft": "Go back", "ArrowRight": "Next",
    "ChevronLeft": "Previous", "ChevronRight": "Next",
    "ChevronDown": "Expand", "ChevronUp": "Collapse",
    "Play": "Play", "Pause": "Pause", "Square": "Stop",
    "Volume2": "Unmute", "VolumeX": "Mute",
    "Mic": "Microphone", "MicOff": "Mute microphone",
    "Maximize": "Fullscreen", "Minimize": "Exit fullscreen",
    "Link": "Link", "Unlink": "Unlink",
    "Lock": "Lock", "Unlock": "Unlock",
    "Eye": "Show", "EyeOff": "Hide",
    "Globe": "Language", "Mail": "Email",
    "User": "Person", "Users": "People",
    "Home": "Home", "Menu": "Menu",
    "Info": "Info", "AlertTriangle": "Warning",
    "ExternalLink": "Open in new tab",
    "Loader2": "Processing", "Loader": "Processing",
    "Music": "Music", "Image": "Image", "Film": "Video",
    "Calendar": "Calendar", "Clock": "Time",
    "Bold": "Bold", "Italic": "Italic", "Underline": "Underline",
    "AlignLeft": "Align left", "AlignCenter": "Align center",
    "AlignRight": "Align right", "AlignJustify": "Justify",
    "Type": "Text", "Palette": "Palette",
    "Bookmark": "Bookmark", "Star": "Favorite",
    "Share": "Share", "Send": "Send",
    "Power": "Disconnect", "Wifi": "Connect",
    "Zap": "Activate", "Layers": "Layers",
    "LayoutGrid": "Grid", "Grid3X3": "Grid",
    "MoreVertical": "More options", "MoreHorizontal": "More options",
    "Pencil": "Edit", "Pen": "Edit",
    "FileText": "Document", "Folder": "Folder",
    "Phone": "Phone", "MessageSquare": "Message",
    "Key": "Key", "Shield": "Security",
    "ToggleLeft": "Toggle off", "ToggleRight": "Toggle on",
    "Move": "Move", "GripVertical": "Drag to reorder",
    "Terminal": "Terminal", "Code": "Code",
    "Database": "Database", "Server": "Server",
    "Monitor": "Monitor", "Smartphone": "Mobile",
    "Cast": "Cast", "Radio": "Radio",
    "MapPin": "Location", "Navigation": "Navigate",
    "Tag": "Tag", "Hash": "Hash",
    "ShoppingCart": "Cart", "CreditCard": "Payment",
    "LogIn": "Log in", "LogOut": "Log out",
    "PowerOff": "Disconnect", "Shuffle": "Shuffle",
    "Repeat": "Repeat", "SkipForward": "Skip",
    "FastForward": "Fast forward", "Rewind": "Rewind",
    "PictureInPicture": "Picture in picture",
    "Scissors": "Trim", "Crop": "Crop",
    "RotateCw": "Rotate", "ZoomIn": "Zoom in", "ZoomOut": "Zoom out",
    "Maximize2": "Fullscreen", "Minimize2": "Exit fullscreen",
    "ArrowUp": "Up", "ArrowDown": "Down",
    "ChevronFirst": "First", "ChevronLast": "Last",
    "Circle": "Circle", "SquareIcon": "Square",
    "Triangle": "Triangle", "Hexagon": "Hexagon",
    "Pentagon": "Pentagon", "Octagon": "Octagon",
    "Crosshair": "Target",
    "Accessibility": "Accessibility",
    "Sparkles": "Auto arrange",
    "Wand2": "Auto arrange", "Wand": "Auto arrange",
    "Paintbrush": "Paint", "PaintBucket": "Fill",
    "Ruler": "Measure", "Grid": "Grid",
    "SlidersHorizontal": "Settings", "Sliders": "Settings",
    "Gauge": "Dashboard", "Activity": "Activity",
    "TrendingUp": "Trending up", "TrendingDown": "Trending down",
    "BarChart": "Chart", "PieChart": "Chart",
    "LineChart": "Chart", "AreaChart": "Chart",
}

# Known text → title (order matters: longer matches first)
TEXT_MAP = [
    ("end service", "End service"),
    ("end service?", "Confirm end service"),
    ("start service", "Start service"),
    ("pause stream", "Pause stream"),
    ("resume stream", "Resume stream"),
    ("disconnect obs", "Disconnect from OBS"),
    ("connect obs", "Connect to OBS"),
    ("setup obs", "Setup OBS"),
    ("send to obs", "Send to OBS"),
    ("clear output", "Clear output"),
    ("blank screen", "Blank screen"),
    ("update now", "Update now"),
    ("remind me later", "Remind me later"),
    ("don't show again", "Don't show again"),
    ("skip recording", "Skip recording"),
    ("start recording", "Start recording"),
    ("skip tour", "Skip tour"),
    ("next step", "Next step"),
    ("previous step", "Previous step"),
    ("learn more", "Learn more"),
    ("get started", "Get started"),
    ("sign in", "Sign in"),
    ("sign out", "Sign out"),
    ("sign up", "Sign up"),
    ("log in", "Log in"),
    ("log out", "Log out"),
    ("finish tour", "Finish tour"),
    ("continue", "Continue"),
    ("cancel", "Cancel"),
    ("close", "Close"),
    ("x", "Close"),
    ("save", "Save"),
    ("delete", "Delete"),
    ("edit", "Edit"),
    ("add", "Add"),
    ("remove", "Remove"),
    ("ok", "OK"),
    ("yes", "Yes"),
    ("no", "No"),
    ("confirm", "Confirm"),
    ("submit", "Submit"),
    ("back", "Go back"),
    ("next", "Next"),
    ("previous", "Previous"),
    ("done", "Done"),
    ("finish", "Finish"),
    ("skip", "Skip"),
    ("retry", "Retry"),
    ("refresh", "Refresh"),
    ("reload", "Reload"),
    ("search", "Search"),
    ("clear", "Clear"),
    ("reset", "Reset"),
    ("apply", "Apply"),
    ("send", "Send"),
    ("download", "Download"),
    ("upload", "Upload"),
    ("import", "Import"),
    ("export", "Export"),
    ("copy", "Copy"),
    ("paste", "Paste"),
    ("undo", "Undo"),
    ("redo", "Redo"),
    ("connect", "Connect"),
    ("disconnect", "Disconnect"),
    ("start", "Start"),
    ("stop", "Stop"),
    ("pause", "Pause"),
    ("resume", "Resume"),
    ("play", "Play"),
    ("open", "Open"),
    ("show", "Show"),
    ("hide", "Hide"),
    ("enable", "Enable"),
    ("disable", "Disable"),
    ("lock", "Lock"),
    ("unlock", "Unlock"),
    ("on", "On"),
    ("off", "Off"),
    ("upgrade", "Upgrade"),
    ("browse", "Browse"),
    ("install", "Install"),
    ("create", "Create"),
    ("select", "Select"),
    ("update", "Update"),
    ("reload themes", "Reload themes"),
    ("create new", "Create new"),
    ("new plan", "New plan"),
]


def find_close_of_opening_tag(lines, start_line):
    """
    Find the closing > of the <button opening tag.
    Returns (line_idx, col_idx) of >, or None.
    Properly handles nested braces, strings, and template literals.
    """
    line = lines[start_line]
    btn_pos = line.find('<button')
    if btn_pos < 0:
        return None

    i = btn_pos + len('<button')
    depth = 0       # {} nesting
    in_str = None   # None, '"', "'", '`'

    for ln in range(start_line, min(start_line + 30, len(lines))):
        code = lines[ln]
        start = i if ln == start_line else 0
        for ci in range(start, len(code)):
            ch = code[ci]
            if in_str:
                if ch == '\\':
                    ci += 1  # skip next (handled below)
                    continue
                if ch == in_str:
                    in_str = None
            else:
                if ch in ('"', "'", '`'):
                    in_str = ch
                elif ch == '{':
                    depth += 1
                elif ch == '}':
                    depth = max(0, depth - 1)
                elif ch == '>' and depth == 0:
                    return (ln, ci)
    return None


def extract_visible_text(lines, open_line, open_col, close_line, close_col):
    """
    Extract the visible text content of a button (everything between > and </button>).
    Returns plain text. Also extracts i18n keys from t("key") patterns.
    Falls back to extracting string literals from JSX ternary expressions.
    """
    parts = []
    i18n_keys = []
    raw_segments = []

    for i in range(close_line, min(close_line + 20, len(lines))):
        line = lines[i]
        if i == close_line:
            start = close_col + 1  # after the >
            segment = line[start:]
        else:
            # Stop at </button>
            end = line.find('</button>')
            if end >= 0:
                segment = line[:end]
            else:
                segment = line

        raw_segments.append(segment)

        # Extract i18n keys from t("key") patterns before stripping
        for m in re.finditer(r't\(["\']([^"\']+)["\']\)', segment):
            i18n_keys.append(m.group(1))

        # Remove JSX tags
        cleaned = re.sub(r'<[^>]*>', ' ', segment)
        # Remove JSX expressions
        cleaned = re.sub(r'\{[^}]*\}', ' ', cleaned)
        cleaned = cleaned.strip()
        if cleaned:
            parts.append(cleaned)

        # Stop at </button>
        if '</button>' in line[close_col + 1:] if i == close_line else '</button>' in line:
            break

    text = ' '.join(parts).strip()
    # If no plain text but we found i18n keys, return the first key as text
    if not text and i18n_keys:
        text = f'i18n:{i18n_keys[0]}'

    # If still no text, try extracting string literals from raw JSX (ternary expressions)
    if not text:
        raw_all = ' '.join(raw_segments)
        strings = extract_jsx_string_literals(raw_all)
        # Filter out short noise strings
        meaningful = [s for s in strings if len(s) > 1 and s not in ('px', 'em', 'rem', '%', 'auto', 'flex', 'none', 'block', 'center', 'left', 'right', 'top', 'bottom', 'row', 'column', 'cover', 'hidden')]
        if meaningful:
            # Pick the most descriptive string (longest)
            text = max(meaningful, key=len)

    return text


def extract_icon_names(lines, open_line, close_line):
    """Extract icon component names from within the button (opening tag + content area up to </button>)."""
    icons = []
    # Search the button opening tag AND content area
    search_end = min(close_line + 15, len(lines))
    # Icon component with name attribute (e.g. <Icon name="save" />)
    icon_pattern = re.compile(r'<Icon\s+name="([^"]*)"')
    # Lucide-react components: PascalCase single-word tags (e.g. <X size={16} />, <Save size={14} />)
    lucide_pattern = re.compile(r'<([A-Z][a-zA-Z]+)\s+(?:size|className|style)')
    # Also handle <X /> without attributes
    lucide_simple = re.compile(r'<([A-Z][a-zA-Z]+)\s*/?>')
    for i in range(open_line, search_end):
        line = lines[i]
        for m in icon_pattern.finditer(line):
            icons.append(m.group(1))
        for m in lucide_pattern.finditer(line):
            name = m.group(1)
            if name not in ('Button', 'Span', 'Div', 'React', 'Label'):
                icons.append(name)
        for m in lucide_simple.finditer(line):
            name = m.group(1)
            if name not in ('Button', 'Span', 'Div', 'React', 'Label'):
                icons.append(name)
        # Stop at </button>
        if '</button>' in line:
            break
    return icons


def extract_jsx_string_literals(text):
    """Extract string literals from JSX expressions like {cond ? "A" : "B"}."""
    strings = re.findall(r'"([^"]+)"', text)
    strings += re.findall(r"'([^']+)'", text)
    return strings


def extract_i18n_key(text):
    """Try to extract an i18n key from text content like t("key.name")."""
    m = re.search(r't\(["\']([^"\']+)["\']\)', text)
    if m:
        return m.group(1)
    # Also handle t('key')
    m = re.search(r't\(([^)]+)\)', text)
    if m:
        val = m.group(1).strip().strip('"\'')
        if '.' in val or val.isidentifier():
            return val
    return None


def key_to_title(key):
    """Convert an i18n key like 'tutorial.common.next' to 'Next'."""
    last = key.split('.')[-1]
    # camelCase → words
    words = re.sub(r'([a-z])([A-Z])', r'\1 \2', last)
    words = words.replace('_', ' ')
    # Remove common prefixes
    for prefix in ('btn', 'button', 'icon', 'action'):
        if words.lower().startswith(prefix):
            words = words[len(prefix):].strip()
    return words.title().strip() if words else None


def generate_title(visible_text, icon_names, tag_line):
    """
    Generate a meaningful title from the button's visible content, icons, or context.
    Returns a string or None.
    """
    text_lower = visible_text.lower().strip()

    # 0. Handle i18n key prefix from extract_visible_text
    if text_lower.startswith('i18n:'):
        key = visible_text[5:]
        t = key_to_title(key)
        if t:
            return t

    # 1. Try i18n key extraction from t("key") patterns
    i18n_key = extract_i18n_key(visible_text)
    if i18n_key:
        t = key_to_title(i18n_key)
        if t:
            return t

    # 2. Try known text patterns (longer first, word-boundary match)
    if text_lower:
        for pattern, title in TEXT_MAP:
            if text_lower == pattern or text_lower.startswith(pattern):
                return title
            if re.search(r'(?<!\w)' + re.escape(pattern) + r'(?!\w)', text_lower):
                return title

    # 3. Use icon names (both Icon name= and lucide-react)
    if icon_names:
        for icon in reversed(icon_names):
            if icon in ICON_MAP:
                return ICON_MAP[icon]
            # Try lucide-react component name → title
            if icon in LUCIDE_MAP:
                return LUCIDE_MAP[icon]

    # 4. Clean text as last resort (must be short and meaningful)
    clean = re.sub(r'[{}<>/]', '', visible_text).strip()
    clean = re.sub(r'\s+', ' ', clean).strip()
    if clean and 2 <= len(clean) <= 35 and clean not in (',', '.', ':', ';', ''):
        return clean

    # 5. Context from className
    tag_lower = tag_line.lower()
    if 'danger' in tag_lower:
        return "Delete"
    if 'primary' in tag_lower:
        return "Confirm"
    if 'close' in tag_lower:
        return "Close"

    return None


def process_file(filepath):
    """Process a single file, adding title attributes to buttons that lack them."""
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    lines = content.split('\n')
    modifications = []  # (line_idx, old_text, new_text)

    for i, line in enumerate(lines):
        if '<button' not in line:
            continue

        # Skip comments
        stripped = line.lstrip()
        if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
            continue

        # Find the closing > of the opening tag
        result = find_close_of_opening_tag(lines, i)
        if result is None:
            continue

        close_line, close_col = result

        # Extract the full opening tag text for checking existing title
        tag_text = ''
        for k in range(i, close_line + 1):
            if k == i:
                tag_text += lines[k][lines[k].find('<button'):]
            elif k == close_line:
                tag_text += ' ' + lines[k][:close_col + 1]
            else:
                tag_text += ' ' + lines[k].strip()

        # Skip if already has title=
        if 'title=' in tag_text:
            continue

        # Extract visible text content (between > and </button>)
        visible_text = extract_visible_text(lines, i, 0, close_line, close_col)

        # Extract icon names
        icon_names = extract_icon_names(lines, i, close_line)

        # Get tag line for className context
        tag_line = lines[i][lines[i].find('<button'):]

        # Generate title
        title = generate_title(visible_text, icon_names, tag_line)
        if not title:
            continue

        # Escape double quotes
        title = title.replace('"', '&quot;')

        # Insert title before the closing > on the close_line
        close_line_text = lines[close_line]
        before = close_line_text[:close_col]
        after = close_line_text[close_col:]  # includes >
        new_line = before + f' title="{title}"' + after
        modifications.append((close_line, close_line_text, new_line))

    # Apply modifications in reverse order
    for line_idx, old_text, new_line in sorted(modifications, reverse=True):
        lines[line_idx] = new_line

    new_content = '\n'.join(lines)
    if new_content != original:
        with open(filepath, 'w') as f:
            f.write(new_content)
        return len(modifications)
    return 0


def main():
    total_added = 0
    total_files = 0

    for root, dirs, files in os.walk(SRC_DIR):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git')]
        for f in sorted(files):
            if not f.endswith('.tsx'):
                continue
            filepath = os.path.join(root, f)
            count = process_file(filepath)
            if count > 0:
                relpath = os.path.relpath(filepath, os.path.join(SRC_DIR, '..'))
                print(f"  +{count:3d} titles  {relpath}")
                total_added += count
                total_files += 1

    print(f"\nTotal: +{total_added} titles added to {total_files} files")


if __name__ == '__main__':
    main()

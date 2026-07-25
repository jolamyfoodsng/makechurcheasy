#!/usr/bin/env python3
"""
add_titles_v2.py — Safely adds title="..." to <button> elements.

Strategy: Parse the full button opening tag, only add title if we can cleanly
identify the closing > without breaking JSX structure.
"""

import re
import os

SRC_DIR = os.path.join(os.path.dirname(__file__), "..", "src")

# Text content → title mapping (case-insensitive)
TEXT_TITLES = {
    "cancel": "Cancel",
    "close": "Close",
    "save": "Save",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "remove": "Remove",
    "ok": "OK",
    "yes": "Yes",
    "no": "No",
    "confirm": "Confirm",
    "submit": "Submit",
    "back": "Go back",
    "next": "Next",
    "previous": "Previous",
    "done": "Done",
    "finish": "Finish",
    "skip": "Skip",
    "retry": "Retry",
    "refresh": "Refresh",
    "reload": "Reload",
    "search": "Search",
    "clear": "Clear",
    "reset": "Reset",
    "apply": "Apply",
    "send": "Send",
    "download": "Download",
    "upload": "Upload",
    "import": "Import",
    "export": "Export",
    "copy": "Copy",
    "paste": "Paste",
    "undo": "Undo",
    "redo": "Redo",
    "connect": "Connect",
    "disconnect": "Disconnect",
    "start": "Start",
    "stop": "Stop",
    "pause": "Pause",
    "resume": "Resume",
    "play": "Play",
    "open": "Open",
    "show": "Show",
    "hide": "Hide",
    "enable": "Enable",
    "disable": "Disable",
    "lock": "Lock",
    "unlock": "Unlock",
    "upgrade": "Upgrade",
    "learn more": "Learn more",
    "get started": "Get started",
    "sign in": "Sign in",
    "sign out": "Sign out",
    "sign up": "Sign up",
    "create": "Create",
    "new": "New",
    "select": "Select",
    "skip tour": "Skip tour",
    "don't show again": "Don't show again",
    "skip recording": "Skip recording",
    "start recording": "Start recording",
    "end service": "End service",
    "disconnect obs": "Disconnect from OBS",
    "update now": "Update now",
    "update": "Update",
    "skip": "Skip",
    "remind me later": "Remind me later",
    "retry": "Retry",
    "browse": "Browse",
    "install": "Install",
    "uninstall": "Uninstall",
    "view": "View",
    "preview": "Preview",
    "send to obs": "Send to OBS",
    "blank": "Blank",
    "clear output": "Clear output",
}


def extract_tag_text(lines, start_line, start_col, end_line, end_col):
    """Extract text content from inside a button element."""
    parts = []
    for i in range(start_line, end_line + 1):
        line = lines[i]
        if i == start_line and i == end_line:
            segment = line[start_col:end_col]
        elif i == start_line:
            segment = line[start_col:]
        elif i == end_line:
            segment = line[:end_col]
        else:
            segment = line
        # Remove tags and expressions, keep text
        cleaned = re.sub(r'<[^>]*>', ' ', segment)
        cleaned = re.sub(r'\{[^}]*\}', ' ', cleaned)
        cleaned = cleaned.strip()
        if cleaned:
            parts.append(cleaned)
    return ' '.join(parts)


def extract_icon_names(lines, start_line, end_line):
    """Extract Icon name attributes from within the button."""
    icons = []
    for i in range(start_line, end_line + 1):
        for m in re.finditer(r'<Icon\s+name="([^"]*)"', lines[i]):
            icons.append(m.group(1))
        # Also handle lowercase <icon name="...">
        for m in re.finditer(r'<icon\s+name="([^"]*)"', lines[i]):
            icons.append(m.group(1))
    return icons


def find_button_close_tag(lines, start_line):
    """
    Find the closing > of a <button opening tag.
    Returns (line_idx, col_idx) of the > character, or None.
    Handles nested {} and "" correctly.
    """
    line = lines[start_line]
    # Find <button in the line
    btn_pos = line.find('<button')
    if btn_pos < 0:
        return None

    # Track depth of braces and quotes
    i = btn_pos + len('<button')
    brace_depth = 0
    in_string = None  # None, '"', "'", '`'

    while i < len(line):
        ch = line[i]

        if in_string:
            if ch == '\\':
                i += 2  # skip escaped char
                continue
            if ch == in_string:
                in_string = None
        else:
            if ch in ('"', "'", '`'):
                in_string = ch
            elif ch == '{':
                brace_depth += 1
            elif ch == '}':
                brace_depth = max(0, brace_depth - 1)
            elif ch == '>' and brace_depth == 0:
                return (start_line, i)

        i += 1

    # Not found on first line — search subsequent lines
    for j in range(start_line + 1, min(start_line + 20, len(lines))):
        line = lines[j]
        i = 0
        while i < len(line):
            ch = line[i]
            if in_string:
                if ch == '\\':
                    i += 2
                    continue
                if ch == in_string:
                    in_string = None
            else:
                if ch in ('"', "'", '`'):
                    in_string = ch
                elif ch == '{':
                    brace_depth += 1
                elif ch == '}':
                    brace_depth = max(0, brace_depth - 1)
                elif ch == '>' and brace_depth == 0:
                    return (j, i)
            i += 1

    return None


def generate_title(tag_text, full_text, icon_names):
    """Generate a meaningful title from button content."""
    text_lower = full_text.lower().strip()

    # Check direct text matches
    for pattern, title in sorted(TEXT_TITLES.items(), key=lambda x: -len(x[0])):
        if pattern in text_lower:
            return title

    # Check i18n key patterns like t("tutorial.common.next")
    key_match = re.search(r't\(["\']([^"\']+)["\']\)', full_text)
    if key_match:
        key = key_match.group(1)
        last_part = key.split('.')[-1]
        words = re.sub(r'([a-z])([A-Z])', r'\1 \2', last_part)
        words = words.replace('_', ' ')
        if len(words) < 40:
            return words.title()

    # Use icon name
    if icon_names:
        icon = icon_names[-1]
        icon_map = {
            "add": "Add", "add_circle": "Add", "arrow_back": "Go back",
            "arrow_forward": "Go forward", "arrow_left": "Previous",
            "arrow_right": "Next", "build": "Repair", "cancel": "Cancel",
            "check": "Confirm", "chevron_left": "Previous",
            "chevron_right": "Next", "clear": "Clear", "close": "Close",
            "content_copy": "Copy", "create": "Edit", "delete": "Delete",
            "delete_outline": "Delete", "download": "Download",
            "edit": "Edit", "expand_less": "Collapse", "expand_more": "Expand",
            "filter_list": "Filter", "fullscreen": "Fullscreen",
            "fullscreen_exit": "Exit fullscreen", "help": "Help",
            "history": "History", "home": "Home", "info": "Info",
            "link": "Link", "lock": "Lock", "lock_open": "Unlock",
            "menu": "Menu", "mic": "Microphone", "mic_off": "Mute microphone",
            "more_vert": "More options", "more_horiz": "More options",
            "music_note": "Music", "notifications": "Notifications",
            "open_in_new": "Open in new tab", "palette": "Palette",
            "pause": "Pause", "pause_presentation": "Pause stream",
            "person": "Person", "play_arrow": "Play", "play_circle": "Play",
            "playlist_add": "Add to playlist",
            "power_settings_new": "Disconnect",
            "push_pin": "Pin", "refresh": "Refresh",
            "remove": "Remove", "remove_circle": "Remove",
            "save": "Save", "search": "Search", "send": "Send",
            "settings": "Settings", "share": "Share",
            "skip_next": "Skip next", "skip_previous": "Skip previous",
            "skip_forward": "Skip", "stop": "Stop",
            "subtitles": "Subtitles", "sync": "Sync",
            "tune": "Settings", "undo": "Undo", "update": "Update",
            "upload": "Upload", "vertical_split": "Split ratio",
            "visibility": "Show", "visibility_off": "Hide",
            "volume_off": "Mute", "volume_up": "Unmute",
            "warning": "Warning", "widgets": "Widgets",
            "zoom_in": "Zoom in", "zoom_out": "Zoom out",
            "check_circle": "Confirm", "check_circle_outline": "Confirm",
            "swap_horiz": "Swap", "text_fields": "Text",
            "timer": "Timer", "replay": "Replay",
            "fast_forward": "Fast forward", "fast_rewind": "Rewind",
            "replay_10": "Rewind 10 seconds", "forward_10": "Forward 10 seconds",
            "subtitles_off": "Hide subtitles", "grid_view": "Grid view",
            "view_carousel": "Carousel view", "view_module": "Module view",
            "splitscreen": "Split screen",
        }
        if icon in icon_map:
            return icon_map[icon]

    # Check className hints
    tag_lower = tag_text.lower()
    if 'danger' in tag_lower:
        return "Delete"
    if 'close' in tag_lower:
        return "Close"
    if 'submit' in tag_lower:
        return "Submit"

    # Use cleaned text if short enough
    clean = re.sub(r'[{}<>]', '', full_text).strip()
    clean = re.sub(r'\s+', ' ', clean).strip()
    if clean and 2 <= len(clean) <= 40 and clean not in (',', '.', ':', '/>'):
        return clean

    return None


def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    lines = content.split('\n')
    modifications = []

    for i, line in enumerate(lines):
        if '<button' not in line:
            continue

        # Skip comments
        stripped = line.lstrip()
        if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
            continue

        # Check if already has title on the same line as <button
        btn_pos = line.find('<button')
        # Extract from <button to end of line
        tag_segment = line[btn_pos:]
        if 'title=' in tag_segment.split('>')[0] if '>' in tag_segment else tag_segment:
            # Title exists on same line as button start
            if '>' in tag_segment:
                # Single-line: check title= before >
                pre_close = tag_segment[:tag_segment.index('>')]
                if 'title=' in pre_close:
                    continue
            else:
                # Multi-line: check if title= appears in tag text before end of line
                if 'title=' in tag_segment:
                    continue

        # Find the closing > of the button opening tag
        result = find_button_close_tag(lines, i)
        if result is None:
            continue

        close_line, close_col = result

        # Check if there's already a title between <button and >
        full_tag_text = ''
        for k in range(i, close_line + 1):
            if k == i:
                start_col = lines[k].find('<button')
                full_tag_text += lines[k][start_col:]
            elif k == close_line:
                full_tag_text += ' ' + lines[k][:close_col + 1]
            else:
                full_tag_text += ' ' + lines[k].strip()

        if 'title=' in full_tag_text:
            continue

        # Extract icon names for title generation
        icon_names = extract_icon_names(lines, i, close_line)

        # Generate title from button text content
        btn_text = extract_tag_text(lines, i, btn_pos, close_line, close_col)

        title = generate_title(full_tag_text, btn_text, icon_names)
        if not title:
            continue

        # Escape quotes
        title = title.replace('"', '\\"')

        # Insert title before the closing >
        close_line_content = lines[close_line]
        # Check if the > is the only thing on its line or has other content
        before_close = close_line_content[:close_col]
        after_close = close_line_content[close_col + 1:]  # after >

        # Add title before >
        new_close_line = before_close + f' title="{title}"' + '>' + after_close
        modifications.append((close_line, new_close_line))

    # Apply modifications in reverse order
    for line_idx, new_line in sorted(modifications, reverse=True):
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

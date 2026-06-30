#!/usr/bin/env python3
"""
add_tooltip_titles_final.py — Adds title="..." to every <button> that lacks one.

Handles both single-line and multi-line button opening tags.
Generates descriptive titles from button text content, icon names, and context.
"""

import re
import os
import sys

SRC_DIR = os.path.join(os.path.dirname(__file__), "..", "src")

# Icon name → descriptive text mapping
ICON_TITLES = {
    "add": "Add",
    "add_circle": "Add",
    "add_circle_outline": "Add",
    "arrow_back": "Go back",
    "arrow_forward": "Go forward",
    "arrow_left": "Previous",
    "arrow_right": "Next",
    "attach_file": "Attach file",
    "attach_money": "Attach file",
    "auto_awesome": "Auto arrange",
    "backspace": "Backspace",
    "block": "Block",
    "bluetooth": "Bluetooth",
    "bookmark": "Bookmark",
    "build": "Repair",
    "calendar_today": "Calendar",
    "cancel": "Cancel",
    "check": "Confirm",
    "check_circle": "Confirm",
    "check_circle_outline": "Confirm",
    "checkroom": "Check room",
    "chevron_left": "Previous",
    "chevron_right": "Next",
    "clear": "Clear",
    "close": "Close",
    "cloud_upload": "Upload",
    "code": "Code",
    "content_copy": "Copy",
    "content_paste": "Paste",
    "copy": "Copy",
    "create": "Edit",
    "delete": "Delete",
    "delete_outline": "Delete",
    "download": "Download",
    "drag_indicator": "Drag to reorder",
    "edit": "Edit",
    "emoji_emotions": "Emoji",
    "expand_less": "Collapse",
    "expand_more": "Expand",
    "extension": "Extensions",
    "file_copy": "Copy file",
    "filter_list": "Filter",
    "folder": "Folder",
    "folder_open": "Open folder",
    "fullscreen": "Fullscreen",
    "fullscreen_exit": "Exit fullscreen",
    "grid_view": "Grid view",
    "group": "Group",
    "help": "Help",
    "history": "History",
    "home": "Home",
    "hourglass_empty": "Processing",
    "image": "Image",
    "info": "Info",
    "key": "Key",
    "language": "Language",
    "link": "Link",
    "list": "List view",
    "lock": "Lock",
    "lock_open": "Unlock",
    "login": "Log in",
    "logout": "Log out",
    "menu": "Menu",
    "menu_book": "Book",
    "mic": "Microphone",
    "mic_off": "Mute microphone",
    "more_vert": "More options",
    "more_horiz": "More options",
    "movie": "Movie",
    "music_note": "Music",
    "navigate_before": "Previous",
    "navigate_next": "Next",
    "notifications": "Notifications",
    "notifications_off": "Mute notifications",
    "open_in_new": "Open in new tab",
    "palette": "Palette",
    "pause": "Pause",
    "pause_presentation": "Pause stream",
    "person": "Person",
    "play_arrow": "Play",
    "play_circle": "Play",
    "playlist_add": "Add to playlist",
    "power_settings_new": "Disconnect",
    "push_pin": "Pin",
    "radio_button_checked": "Select",
    "radio_button_unchecked": "Deselect",
    "refresh": "Refresh",
    "remove": "Remove",
    "remove_circle": "Remove",
    "repeat": "Repeat",
    "replay": "Replay",
    "resize": "Resize",
    "save": "Save",
    "search": "Search",
    "send": "Send",
    "settings": "Settings",
    "share": "Share",
    "shuffle": "Shuffle",
    "skip_next": "Skip next",
    "skip_previous": "Skip previous",
    "skip_forward": "Skip",
    "smart_display": "Smart display",
    "splitscreen": "Split screen",
    "subtitles": "Subtitles",
    "subtitles_off": "Hide subtitles",
    "swap_horiz": "Swap",
    "sync": "Sync",
    "text_fields": "Text",
    "timer": "Timer",
    "toggle_off": "Toggle off",
    "toggle_on": "Toggle on",
    "tune": "Settings",
    "undo": "Undo",
    "update": "Update",
    "upload": "Upload",
    "vertical_split": "Split ratio",
    "view_carousel": "Carousel view",
    "view_module": "Module view",
    "visibility": "Show",
    "visibility_off": "Hide",
    "volume_off": "Mute",
    "volume_up": "Unmute",
    "warning": "Warning",
    "widgets": "Widgets",
    "zoom_in": "Zoom in",
    "zoom_out": "Zoom out",
    "mic_off": "Mute",
    "stop": "Stop",
    "stop_circle": "Stop",
    "fast_forward": "Fast forward",
    "fast_rewind": "Rewind",
    "replay_10": "Rewind 10s",
    "forward_10": "Forward 10s",
    "replay_5": "Rewind 5s",
    "forward_5": "Forward 5s",
}

# Text content → title mapping
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
    "close": "Close",
    "show": "Show",
    "hide": "Hide",
    "enable": "Enable",
    "disable": "Disable",
    "lock": "Lock",
    "unlock": "Unlock",
    "on": "On",
    "off": "Off",
    "yes": "Yes",
    "no": "No",
    "upgrade": "Upgrade",
    "learn more": "Learn more",
    "get started": "Get started",
    "sign in": "Sign in",
    "sign out": "Sign out",
    "log in": "Log in",
    "log out": "Log out",
    "sign up": "Sign up",
    "create": "Create",
    "new": "New",
    "add new": "Add new",
    "select": "Select",
    "deselect": "Deselect",
    "all": "All",
    "none": "None",
    "none": "None",
    "ok": "OK",
    "got it": "Got it",
    "understood": "Understood",
    "dismiss": "Dismiss",
    "accept": "Accept",
    "reject": "Reject",
    "approve": "Approve",
    "deny": "Deny",
    "skip tour": "Skip tour",
    "don't show again": "Don't show again",
}


def extract_button_text(lines, open_line_idx, close_line_idx):
    """Extract the visible text content of a button element."""
    # Get all lines between opening and closing <button> tags
    text_parts = []
    for i in range(open_line_idx, close_line_idx + 1):
        line = lines[i]
        # Remove HTML tags, keeping only text
        cleaned = re.sub(r'<[^>]+>', ' ', line)
        cleaned = re.sub(r'\{[^}]*\}', ' ', cleaned)
        cleaned = re.sub(r'title="[^"]*"', '', cleaned)
        cleaned = re.sub(r'className="[^"]*"', '', cleaned)
        cleaned = cleaned.strip()
        if cleaned and cleaned not in ('>', '/>', ''):
            text_parts.append(cleaned)
    return ' '.join(text_parts).strip()


def extract_icon_names(lines, open_line_idx, close_line_idx):
    """Extract icon names from within the button."""
    icons = []
    for i in range(open_line_idx, close_line_idx + 1):
        line = lines[i]
        m = re.search(r'<Icon\s+name="([^"]*)"', line)
        if m:
            icons.append(m.group(1))
    return icons


def guess_title_from_context(lines, open_line_idx, close_line_idx, btn_line):
    """Generate a title based on the button's content and context."""
    btn_text = extract_button_text(lines, open_line_idx, close_line_idx)
    icons = extract_icon_names(lines, open_line_idx, close_line_idx)

    # Try to match text content
    text_lower = btn_text.lower().strip()

    # Check for direct text matches
    for pattern, title in sorted(TEXT_TITLES.items(), key=lambda x: -len(x[0])):
        if pattern in text_lower:
            return title

    # Check if text is a JSX expression like {t("some.key")}
    # Extract the key and generate title from it
    key_match = re.search(r't\(["\']([^"\']+)["\']\)', btn_text)
    if key_match:
        key = key_match.group(1)
        # Convert dot notation to readable text
        parts = key.split('.')[-1]  # Take last part
        # Convert camelCase/snake_case to words
        words = re.sub(r'([a-z])([A-Z])', r'\1 \2', parts)
        words = words.replace('_', ' ')
        return words.title()

    # Use icon name if available
    if icons:
        icon_name = icons[-1]  # Use the last/main icon
        if icon_name in ICON_TITLES:
            title = ICON_TITLES[icon_name]
            # Add text context if available
            if text_lower and text_lower not in ('>', '{x}', '{x}'):
                # Clean the text
                clean_text = re.sub(r'[{}]', '', btn_text).strip()
                clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                if clean_text and len(clean_text) < 40 and clean_text not in (',', '.', ':', '/>'):
                    return clean_text
            return title

    # Check className for context hints
    full_open = ' '.join(lines[open_line_idx:close_line_idx + 1]).lower()

    if 'danger' in full_open or 'delete' in full_open or 'remove' in full_open:
        return "Delete"
    if 'primary' in full_open:
        return "Confirm"
    if 'secondary' in full_open or 'ghost' in full_open:
        return "Cancel"
    if 'close' in full_open:
        return "Close"
    if 'menu' in full_open:
        return "Menu"
    if 'nav' in full_open:
        return "Navigate"
    if 'submit' in full_open:
        return "Submit"

    # Use text content as fallback
    clean_text = re.sub(r'[{}]', '', btn_text).strip()
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    if clean_text and len(clean_text) < 40 and clean_text not in (',', '.', ':', '/>', ''):
        return clean_text

    return None  # Could not determine title


def process_file(filepath):
    """Process a single file, adding title attributes to buttons that lack them."""
    with open(filepath, 'r') as f:
        content = f.read()

    lines = content.split('\n')
    modifications = []

    # Find all <button tags and their structure
    for i, line in enumerate(lines):
        if '<button' not in line:
            continue

        # Skip if this is inside a comment
        if re.search(r'//.*<button', line) or re.search(r'/\*.*<button', line):
            continue

        # Check if this line already has a title=
        if 'title=' in line:
            continue

        # Find the opening tag structure
        # Case 1: Single-line button: <button ... > or <button ... />
        match = re.match(r'^(\s*)(<button\b.*?)(>)', line)
        if match:
            indent = match.group(1)
            tag_content = match.group(2)
            closing = match.group(3)

            # Don't process if title already exists
            if 'title=' in tag_content:
                continue

            # Generate title
            title = guess_title_from_context(lines, i, i, tag_content)
            if title:
                # Escape any double quotes in title
                title = title.replace('"', '\\"')
                # Add title before the closing >
                new_line = f'{indent}{tag_content} title="{title}"{line[len(indent) + len(tag_content) + 1:]}'
                # Actually, we need to preserve the rest of the line after >
                after_close = line[match.end(3):]
                new_line = f'{indent}{tag_content} title="{title}"{after_close}'
                modifications.append((i, new_line))
            continue

        # Case 2: Multi-line button - find the closing > of the opening tag
        # Look for the > that closes this <button tag
        tag_start_col = line.index('<button')
        rest_of_tag = line[tag_start_col:]

        # Check if > is on this line after <button
        close_idx = rest_of_tag.find('>')
        if close_idx >= 0:
            # Closing > is on the same line
            tag_content = rest_of_tag[:close_idx]
            if 'title=' in tag_content:
                continue
            title = guess_title_from_context(lines, i, i, tag_content)
            if title:
                title = title.replace('"', '\\"')
                new_line = line[:tag_start_col + close_idx] + f' title="{title}"' + line[tag_start_col + close_idx:]
                modifications.append((i, new_line))
            continue

        # Closing > is on a later line - find it
        found_close = False
        for j in range(i + 1, min(i + 15, len(lines))):
            jline = lines[j]
            if '>' in jline:
                # Found the closing line
                # Build the full tag content for context
                tag_lines = lines[i:j+1]
                full_tag = ' '.join(l.strip() for l in tag_lines)

                if 'title=' in full_tag:
                    break

                title = guess_title_from_context(lines, i, j, full_tag)
                if title:
                    title = title.replace('"', '\\"')
                    # Insert title before the > on the closing line
                    close_col = jline.index('>')
                    new_jline = jline[:close_col] + f' title="{title}"' + jline[close_col:]
                    modifications.append((j, new_jline))
                found_close = True
                break

        if not found_close:
            print(f"  WARNING: Could not find closing > for button at line {i+1} in {filepath}")

    # Apply modifications in reverse order (to preserve line numbers)
    for line_idx, new_line in sorted(modifications, reverse=True):
        lines[line_idx] = new_line

    if modifications:
        with open(filepath, 'w') as f:
            f.write('\n'.join(lines))
        return len(modifications)
    return 0


def main():
    total_added = 0
    total_files = 0

    for root, dirs, files in os.walk(SRC_DIR):
        # Skip node_modules, etc.
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

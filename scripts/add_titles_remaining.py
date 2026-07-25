#!/usr/bin/env python3
"""
Add title attributes to multi-line <button> elements in TSX files that are missing titles.
Reads each file, finds button opening tags that span multiple lines, and adds an appropriate title.
"""

import os
import re
from pathlib import Path

SRC_DIR = Path("/Users/pc/Desktop/Code/makechurcheasy/desktop/src")

# Map of icon names to tooltip text
ICON_TOOLTIPS = {
    "add": "Add", "close": "Close", "delete": "Delete", "edit": "Edit",
    "save": "Save", "search": "Search", "settings": "Settings",
    "more_vert": "More options", "more_horiz": "More options",
    "expand_more": "Expand", "expand_less": "Collapse",
    "chevron_left": "Go back", "chevron_right": "Go forward",
    "arrow_back": "Go back", "arrow_forward": "Go forward",
    "arrow_up": "Move up", "arrow_down": "Move down",
    "refresh": "Refresh", "copy": "Copy", "content_copy": "Copy",
    "undo": "Undo", "redo": "Redo",
    "visibility": "Show", "visibility_off": "Hide",
    "check": "Confirm", "cancel": "Cancel",
    "star": "Favorite", "star_border": "Add to favorites",
    "fullscreen": "Fullscreen", "fullscreen_exit": "Exit fullscreen",
    "zoom_in": "Zoom in", "zoom_out": "Zoom out",
    "play_arrow": "Play", "pause": "Pause", "stop": "Stop",
    "skip_next": "Next", "skip_previous": "Previous",
    "send": "Send", "download": "Download", "upload": "Upload",
    "link": "Link", "share": "Share", "print": "Print",
    "filter_list": "Filter", "sort": "Sort",
    "push_pin": "Pin", "archive": "Archive",
    "history": "History", "schedule": "Schedule",
    "home": "Home", "dashboard": "Dashboard", "menu": "Menu",
    "open_in_new": "Open in new window",
    "drag_indicator": "Drag to reorder",
    "swap_horiz": "Swap", "swap_vert": "Swap",
    "content_paste": "Paste", "clear": "Clear",
    "lock": "Lock", "lock_open": "Unlock",
    "grid_view": "Grid view", "view_list": "List view",
    "sync": "Sync", "cloud_sync": "Sync",
    "system_update": "System update",
    "downloading": "Downloading", "restart_alt": "Restart",
    "error_outline": "Error", "notifications": "Notifications",
    "logout": "Logout", "login": "Sign in",
    "person": "User", "people": "Users",
    "format_bold": "Bold", "format_italic": "Italic",
    "format_underline": "Underline", "format_color_text": "Text color",
    "format_size": "Font size", "mic": "Microphone", "mic_off": "Mute microphone",
    "volume_up": "Volume", "volume_off": "Mute",
    "auto_fix_high": "Enhance", "crop": "Crop",
    "rotate_left": "Rotate left", "rotate_right": "Rotate right",
    "image": "Image", "photo_library": "Media library",
    "palette": "Theme", "color_lens": "Color",
    "text_fields": "Text", "tune": "Adjust settings",
    "analytics": "Analytics", "credit_card": "Credit card",
    "account_circle": "Account", "verified": "Verified",
    "security": "Security", "folder": "Folder",
    "folder_open": "Open folder", "insert_drive_file": "File",
    "description": "Document", "chat": "Chat",
    "email": "Email", "phone": "Phone",
    "center_focus_strong": "Focus", "crop_free": "Fit to screen",
    "open_with": "Move", "drag_handle": "Drag handle",
    "local_fire_department": "Fire", "science": "Science",
    "gavel": "Legal", "vpn_key": "Key",
    "fingerprint": "Fingerprint", "inventory": "Inventory",
    "shopping_cart": "Cart", "payments": "Payments",
    "play_circle": "Play", "stop_circle": "Stop",
    "delete_sweep": "Delete all", "cloud_upload": "Upload",
    "library_music": "Audio library", "music_off": "No audio",
    "add_photo_alternate": "Add image", "switch_video": "Scene",
    "wifi": "OBS connected", "short_text": "Label",
    "info": "Info", "warning": "Warning",
    "error": "Error", "check_circle": "Completed",
    "radio_button_checked": "Selected", "block": "Block",
    "content_copy": "Copy", "flip_to_back": "Send to back",
    "flip_to_front": "Bring to front",
    "build": "Maintenance", "videocam": "Camera",
    "campaign": "Ticker", "link": "Connect",
    "menu_book": "Bible", "visibility": "Visibility",
    "history": "History", "replay": "Reset",
    "arrow_back": "Back", "event_note": "Event",
    "assignment": "Plan",
}

# Map of onClick handler patterns to tooltip text
ONCLICK_MAPPINGS = [
    (r'cancel|Cancel', "Cancel"), (r'close|Close', "Close"),
    (r'delete|Delete', "Delete"), (r'remove|Remove', "Remove"),
    (r'save|Save', "Save"), (r'submit|Submit', "Submit"),
    (r'confirm|Confirm', "Confirm"),
    (r'edit|Edit', "Edit"), (r'rename|Rename', "Rename"),
    (r'add|Add', "Add"), (r'create|Create', "Create"),
    (r'back|Back', "Go back"), (r'next|Next', "Next"),
    (r'toggle|Toggle', "Toggle"),
    (r'refresh|Refresh', "Refresh"),
    (r'connect|Connect', "Connect"),
    (r'disconnect|Disconnect', "Disconnect"),
    (r'search|Search', "Search"),
    (r'play|Play', "Play"), (r'stop|Stop', "Stop"),
    (r'pause|Pause', "Pause"),
    (r'download|Download', "Download"),
    (r'upload|Upload', "Upload"),
    (r'copy|Copy', "Copy"), (r'paste|Paste', "Paste"),
    (r'undo|Undo', "Undo"), (r'redo|Redo', "Redo"),
    (r'share|Share', "Share"), (r'print|Print', "Print"),
    (r'export|Export', "Export"), (r'import|Import', "Import"),
    (r'login|signIn', "Sign in"),
    (r'logout|signOut', "Sign out"),
    (r'start|Start', "Start"), (r'end|End', "End"),
    (r'reset|Reset', "Reset"), (r'clear|Clear', "Clear"),
    (r'expand|Expand', "Expand"), (r'collapse|Collapse', "Collapse"),
    (r'dismiss|Dismiss', "Dismiss"),
    (r'retry|Retry', "Retry"),
    (r'update|Update', "Update"),
    (r'apply|Apply', "Apply"),
    (r'push|Push', "Push"), (r'preview|Preview', "Preview"),
    (r'zoom|Zoom', "Zoom"), (r'move|Move', "Move"),
    (r'reorder|Reorder', "Reorder"),
    (r'duplicate|Duplicate', "Duplicate"),
    (r'pin|Pin', "Pin"),
    (r'favorite|Favorite', "Toggle favorite"),
    (r'queue|Queue', "Add to queue"),
    (r'lock|Lock', "Lock"),
    (r'open|Open', "Open"),
    (r'mute|Mute', "Mute"),
    (r'accept|Accept', "Accept"),
    (r'decline|Decline', "Decline"),
    (r'resume|Resume', "Resume"),
    (r'select|Select', "Select"),
    (r'pick|Pick', "Pick"),
    (r'browse|Browse', "Browse"),
    (r'stage|Stage', "Stage"),
    (r'goLive|go_live|go-live', "Go live"),
    (r'clearMedia|clear_media', "Clear media"),
    (r'sendCue|send_cue', "Send cue"),
    (r'sendVerse|send_verse', "Send verse"),
    (r'sendBible|send_bible', "Send Bible"),
    (r'sendSlide|send_slide', "Send slide"),
    (r'sendLowerThird|send_lower_third', "Send lower third"),
    (r'sendTicker|send_ticker', "Send ticker"),
    (r'sendText|send_text', "Send text"),
    (r'sendGraphic|send_graphic', "Send graphic"),
]

# Class name patterns to tooltip
CLASS_PATTERNS = [
    (r'cancel', "Cancel"), (r'close', "Close"), (r'delete', "Delete"),
    (r'remove', "Remove"), (r'save', "Save"), (r'submit', "Submit"),
    (r'confirm', "Confirm"), (r'edit', "Edit"), (r'add\b', "Add"),
    (r'create', "Create"), (r'refresh', "Refresh"), (r'search', "Search"),
    (r'back', "Go back"), (r'forward', "Go forward"),
    (r'play', "Play"), (r'stop', "Stop"), (r'pause', "Pause"),
    (r'download', "Download"), (r'upload', "Upload"),
    (r'toggle', "Toggle"), (r'expand', "Expand"), (r'collapse', "Collapse"),
    (r'connect', "Connect"), (r'disconnect', "Disconnect"),
    (r'share', "Share"), (r'export', "Export"), (r'import', "Import"),
    (r'copy', "Copy"), (r'paste', "Paste"),
    (r'undo', "Undo"), (r'redo', "Redo"),
    (r'fullscreen', "Fullscreen"), (r'minimize', "Minimize"),
    (r'next', "Next"), (r'prev', "Previous"),
    (r'lock', "Lock"), (r'unlock', "Unlock"),
    (r'pin', "Pin"), (r'favorite', "Favorite"), (r'bookmark', "Bookmark"),
    (r'send', "Send"), (r'apply', "Apply"),
    (r'reset', "Reset"), (r'clear', "Clear"),
    (r'mute', "Mute"), (r'unmute', "Unmute"),
    (r'login', "Sign in"), (r'logout', "Sign out"),
    (r'sign.in', "Sign in"), (r'sign.out', "Sign out"),
    (r'update', "Update"), (r'upgrade', "Upgrade"),
    (r'dismiss', "Dismiss"), (r'retry', "Retry"),
    (r'accept', "Accept"), (r'decline', "Decline"),
    (r'start', "Start"), (r'end', "End"),
    (r'resume', "Resume"),
    (r'preview', "Preview"), (r'inspect', "Inspect"),
    (r'move', "Move"), (r'reorder', "Reorder"),
    (r'duplicate', "Duplicate"), (r'clone', "Clone"),
    (r'menu-btn', "More options"), (r'menu-item', None),
    (r'context-item', None),
    (r'gallery-card', None),
    (r'song-card', None),
]


def get_tooltip_for_button(block_text):
    """Given the full button opening tag text, determine an appropriate tooltip."""
    # Priority 1: Already has title= (skip)
    if re.search(r'title=', block_text):
        return None

    # Priority 2: aria-label with t() call
    m = re.search(r'aria-label=\{t\("([^"]+)"', block_text)
    if m:
        parts = m.group(1).split(".")
        return re.sub(r'([A-Z])', r' \1', parts[-1]).strip().title()

    # Priority 3: aria-label string
    m = re.search(r'aria-label="([^"]*)"', block_text)
    if m and m.group(1) and len(m.group(1)) > 2:
        return m.group(1)

    # Priority 4: Icon name
    m = re.search(r'<Icon\s+name="([^"]+)"', block_text)
    if m:
        icon_name = m.group(1)
        if icon_name in ICON_TOOLTIPS:
            return ICON_TOOLTIPS[icon_name]

    # Priority 5: onClick handler name
    m = re.search(r'onClick=\{(?:\(\)\s*=>\s*)?(\w+)', block_text)
    if m:
        handler = m.group(1)
        for pattern, tooltip in ONCLICK_MAPPINGS:
            if re.search(pattern, handler, re.IGNORECASE) and tooltip:
                return tooltip

    # Priority 6: className patterns
    cls_match = re.search(r'className="([^"]*)"', block_text)
    if cls_match:
        cls = cls_match.group(1).lower()
        for pattern, tooltip in CLASS_PATTERNS:
            if re.search(pattern, cls) and tooltip:
                return tooltip

    # Priority 7: Text content
    m = re.search(r'>\s*\{t\("([^"]+)"', block_text)
    if m:
        parts = m.group(1).split(".")
        return parts[-1]

    m = re.search(r'>([A-Za-z][A-Za-z0-9 ]{1,40})<', block_text)
    if m:
        return m.group(1).strip()

    return None


def find_button_blocks(content):
    """Find all <button opening tags and their full content up to the closing >."""
    blocks = []
    i = 0
    while i < len(content):
        # Find <button opening tag
        match = re.search(r'<button\b', content[i:])
        if not match:
            break

        start = i + match.start()

        # Find the > that closes the opening tag
        depth = 0
        j = i + match.end()
        in_string = None
        while j < len(content):
            c = content[j]
            if in_string:
                if c == '\\':
                    j += 2
                    continue
                if c == in_string:
                    in_string = None
            elif c in ('"', "'"):
                in_string = c
            elif c == '{':
                depth += 1
            elif c == '}':
                depth = max(0, depth - 1)
            elif c == '>' and depth == 0:
                break
            j += 1

        if j < len(content):
            tag_content = content[start:j + 1]
            blocks.append((start, j + 1, tag_content))
            i = j + 1
        else:
            break

    return blocks


def process_file(filepath):
    """Process a single file, adding titles to buttons missing them."""
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        return 0, str(e)

    blocks = find_button_blocks(content)
    changes = 0
    result = content

    # Process blocks in reverse order to avoid index shifts
    for start, end, tag_text in reversed(blocks):
        # Skip if already has title
        if re.search(r'title=', tag_text):
            continue

        tooltip = get_tooltip_for_button(tag_text)
        if not tooltip:
            continue

        # Escape quotes in tooltip
        tooltip = tooltip.replace('"', '\\"')

        # Find the closing > of the opening tag
        # We need to insert title="..." before the >
        close_bracket_pos = tag_text.rfind('>')
        if close_bracket_pos <= 0:
            continue

        # Insert title before >
        new_tag = tag_text[:close_bracket_pos] + f'\n              title="{tooltip}"' + tag_text[close_bracket_pos:]

        # Preserve indentation - find the indentation of the first attribute after <button
        indent_match = re.search(r'\n(\s+)', tag_text)
        if indent_match:
            indent = indent_match.group(1)
            new_tag = tag_text[:close_bracket_pos] + f'\n{indent}title="{tooltip}"' + tag_text[close_bracket_pos:]

        result = result[:start] + new_tag + result[end:]
        changes += 1

    if changes > 0:
        filepath.write_text(result, encoding="utf-8")

    return changes, None


def main():
    tsx_files = sorted(SRC_DIR.rglob("*.tsx"))
    total_changes = 0
    files_changed = 0

    for fp in tsx_files:
        if "_removed" in str(fp) or ".backup" in str(fp) or "node_modules" in str(fp):
            continue
        changes, err = process_file(fp)
        if err:
            print(f"  ERROR {fp.relative_to(SRC_DIR)}: {err}")
        if changes > 0:
            rel = fp.relative_to(SRC_DIR)
            print(f"  +{changes} titles in {rel}")
            total_changes += changes
            files_changed += 1

    print(f"\nTotal: {total_changes} titles added across {files_changed} files")


if __name__ == "__main__":
    main()

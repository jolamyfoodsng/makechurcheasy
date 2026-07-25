#!/usr/bin/env python3
"""
v3-safe: Add title attributes to <button> elements in TSX files.

SAFETY RULES:
1. Only process SINGLE-LINE <button opening tags (everything on one line ending with >)
2. Never modify multi-line button tags (let agents handle those)
3. Skip buttons that already have title=
4. Skip buttons inside JSX expressions (depth > 0 at insertion point)
"""

import os
import re
import sys
from pathlib import Path

SRC_DIR = Path("/Users/pc/Desktop/Code/makechurcheasy/desktop/src")

# ── Heuristic tooltip map based on class/aria/text patterns ──
TOOLTIP_RULES = [
    # Cancel/Close patterns
    (r'aria-label=\{t\("([^"]*cancel[^"]*)"', lambda m: _clean_key(m.group(1))),
    (r'aria-label=\{t\("([^"]*close[^"]*)"', lambda m: _clean_key(m.group(1))),
    (r'className="[^"]*cancel[^"]*"', "Cancel"),
    (r'className="[^"]*close[^"]*"', "Close"),
    (r'className="[^"]*dismiss[^"]*"', "Dismiss"),
    (r'onClick=\{[^}]*cancel[^}]*\}', "Cancel"),
    (r'onClick=\{[^}]*dismiss[^}]*\}', "Dismiss"),
    (r'onClick=\{[^}]*handleClose[^}]*\}', "Close"),
    (r'onClick=\{[^}]*setShow[^}]*false[^}]*\}', "Close"),

    # Delete/Remove patterns
    (r'aria-label=\{t\("([^"]*delete[^"]*)"', lambda m: _clean_key(m.group(1))),
    (r'aria-label=\{t\("([^"]*remove[^"]*)"', lambda m: _clean_key(m.group(1))),
    (r'className="[^"]*delete[^"]*"', "Delete"),
    (r'className="[^"]*remove[^"]*"', "Remove"),
    (r'onClick=\{[^}]*delete[^}]*\}', "Delete"),
    (r'onClick=\{[^}]*remove[^}]*\}', "Remove"),

    # Save/Confirm patterns
    (r'aria-label=\{t\("([^"]*save[^"]*)"', lambda m: _clean_key(m.group(1))),
    (r'aria-label=\{t\("([^"]*confirm[^"]*)"', lambda m: _clean_key(m.group(1))),
    (r'className="[^"]*save[^"]*btn', "Save"),
    (r'className="[^"]*confirm[^"]*btn', "Confirm"),
    (r'onClick=\{[^}]*handleSave[^}]*\}', "Save"),
    (r'onClick=\{[^}]*handleSubmit[^}]*\}', "Submit"),
    (r'onClick=\{[^}]*handleConfirm[^}]*\}', "Confirm"),

    # Edit patterns
    (r'aria-label=\{t\("([^"]*edit[^"]*)"', lambda m: _clean_key(m.group(1))),
    (r'onClick=\{[^}]*handleEdit[^}]*\}', "Edit"),
    (r'onClick=\{[^}]*startEdit[^}]*\}', "Edit"),
    (r'onClick=\{[^}]*rename[^}]*\}', "Rename"),

    # Add/Create patterns
    (r'aria-label=\{t\("([^"]*add[^"]*)"', lambda m: _clean_key(m.group(1))),
    (r'aria-label=\{t\("([^"]*create[^"]*)"', lambda m: _clean_key(m.group(1))),
    (r'className="[^"]*add-btn[^"]*"', "Add"),
    (r'onClick=\{[^}]*handleAdd[^}]*\}', "Add"),
    (r'onClick=\{[^}]*addItem[^}]*\}', "Add item"),
    (r'onClick=\{[^}]*createNew[^}]*\}', "Create new"),
    (r'onClick=\{[^}]*newLayout[^}]*\}', "New layout"),

    # Navigation patterns
    (r'onClick=\{[^}]*handleBack[^}]*\}', "Go back"),
    (r'onClick=\{[^}]*goBack[^}]*\}', "Go back"),
    (r'onClick=\{[^}]*navigate[^}]*back[^}]*\}', "Go back"),
    (r'onClick=\{[^}]*handleNext[^}]*\}', "Next"),

    # Toggle patterns
    (r'onClick=\{[^}]*toggle[^}]*\}', "Toggle"),
    (r'onClick=\{[^}]*handleToggle[^}]*\}', "Toggle"),

    # Search patterns
    (r'className="[^"]*search[^"]*btn', "Search"),
    (r'onClick=\{[^}]*handleSearch[^}]*\}', "Search"),

    # Refresh patterns
    (r'onClick=\{[^}]*handleRefresh[^}]*\}', "Refresh"),
    (r'onClick=\{[^}]*refresh[^}]*\}', "Refresh"),

    # Connect/Disconnect patterns
    (r'onClick=\{[^}]*handleConnect[^}]*\}', "Connect"),
    (r'onClick=\{[^}]*handleDisconnect[^}]*\}', "Disconnect"),

    # Play/Stop patterns
    (r'onClick=\{[^}]*handlePlay[^}]*\}', "Play"),
    (r'onClick=\{[^}]*handleStop[^}]*\}', "Stop"),
    (r'onClick=\{[^}]*handlePause[^}]*\}', "Pause"),

    # Icon-only buttons (last resort, with Icon name)
    (r'<Icon\s+name="([^"]+)"', None),  # handled separately
]


def _clean_key(key):
    """Convert i18n key to human-readable tooltip."""
    parts = key.split(".")
    last = parts[-1] if parts else key
    # camelCase to words
    words = re.sub(r'([A-Z])', r' \1', last)
    return words.strip().title()


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
    "label": "Label", "flag": "Flag",
    "grid_view": "Grid view", "view_list": "List view",
    "sync": "Sync", "cloud_sync": "Sync",
    "system_update": "System update",
    "downloading": "Downloading",
    "restart_alt": "Restart",
    "error_outline": "Error",
    "notifications": "Notifications",
    "logout": "Logout", "login": "Sign in",
    "person": "User", "people": "Users",
    "logout": "Logout",
    "format_bold": "Bold", "format_italic": "Italic",
    "format_underline": "Underline",
    "format_color_text": "Text color",
    "format_size": "Font size",
    "mic": "Microphone", "mic_off": "Mute microphone",
    "volume_up": "Volume", "volume_off": "Mute",
    "auto_fix_high": "Enhance",
    "crop": "Crop", "rotate_left": "Rotate left",
    "rotate_right": "Rotate right",
    "image": "Image", "photo_library": "Media library",
    "palette": "Theme", "color_lens": "Color",
    "text_fields": "Text",
    "tune": "Adjust settings",
    "analytics": "Analytics",
    "credit_card": "Credit card",
    "account_circle": "Account",
    "verified": "Verified",
    "local_hospital": "Hospital",
    "security": "Security",
    "folder": "Folder", "folder_open": "Open folder",
    "insert_drive_file": "File",
    "description": "Document",
    "chat": "Chat", "email": "Email", "phone": "Phone",
    "center_focus_strong": "Focus",
    "crop_free": "Fit to screen",
    "open_with": "Move",
    "drag_handle": "Drag handle",
    "label": "Label",
    "local_fire_department": "Fire",
    "science": "Science",
    "gavel": "Legal",
    "vpn_key": "Key",
    "fingerprint": "Fingerprint",
    "inventory": "Inventory",
    "shopping_cart": "Cart",
    "payments": "Payments",
    "savings": "Savings",
    "biotech": "Biotech",
    "balance_scale": "Balance",
    "no_encryption": "No encryption",
    "enhanced_encryption": "Encryption",
    "play_circle": "Play",
    "stop_circle": "Stop",
    "radio_button_checked": "On",
    "radio_button_unchecked": "Off",
    "check_box": "Checked",
    "check_box_outline_blank": "Unchecked",
    "toggle_on": "On",
    "toggle_off": "Off",
}


def find_safe_insert_point(line):
    """
    Find the position to insert title="..." in a single-line button opening tag.
    Returns (position, bracket_depth) or None if unsafe.

    Safety: if the > is inside {} at depth>0, skip.
    """
    depth = 0
    in_string = None
    i = 0
    while i < len(line):
        c = line[i]
        if in_string:
            if c == '\\':
                i += 2
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
            return i
        i += 1
    return None


def get_aria_label(line):
    """Extract aria-label text from the line."""
    # aria-label={t("key.path")}
    m = re.search(r'aria-label=\{t\("([^"]+)"', line)
    if m:
        return _clean_key(m.group(1))
    # aria-label="string"
    m = re.search(r'aria-label="([^"]*)"', line)
    if m and m.group(1):
        return m.group(1)
    # aria-label={`text ${expr} text`}
    m = re.search(r'aria-label=\{`([^`]*)`\}', line)
    if m:
        cleaned = re.sub(r'\$\{[^}]*\}', '', m.group(1)).strip()
        if cleaned:
            return cleaned
    return None


def get_icon_name(line):
    """Extract Icon name from button line."""
    m = re.search(r'<Icon\s+name="([^"]+)"', line)
    return m.group(1) if m else None


def get_text_content(line):
    """Extract text between > and </button on the same line, or t() call."""
    # t("key")
    m = re.search(r'\{t\("([^"]+)"', line)
    if m:
        parts = m.group(1).split(".")
        return _clean_key(parts[-1])
    # Plain text content
    m = re.search(r'>([A-Za-z][A-Za-z0-9 ]{1,40})</', line)
    if m:
        return m.group(1).strip()
    return None


def get_class_tooltip(line):
    """Try to get tooltip from className patterns."""
    cls_match = re.search(r'className="([^"]*)"', line)
    if not cls_match:
        return None
    cls = cls_match.group(1).lower()

    # Map common class patterns to tooltips
    patterns = [
        (r'cancel', "Cancel"), (r'close', "Close"), (r'delete', "Delete"),
        (r'remove', "Remove"), (r'save', "Save"), (r'submit', "Submit"),
        (r'confirm', "Confirm"), (r'edit', "Edit"), (r'add', "Add"),
        (r'create', "Create"), (r'refresh', "Refresh"), (r'search', "Search"),
        (r'back', "Go back"), (r'forward', "Go forward"),
        (r'primary', None), (r'secondary', None), (r'danger', None),
        (r'play', "Play"), (r'stop', "Stop"), (r'pause', "Pause"),
        (r'download', "Download"), (r'upload', "Upload"),
        (r'toggle', "Toggle"), (r'expand', "Expand"), (r'collapse', "Collapse"),
        (r'connect', "Connect"), (r'disconnect', "Disconnect"),
        (r'share', "Share"), (r'print', "Print"), (r'export', "Export"),
        (r'import', "Import"), (r'copy', "Copy"), (r'paste', "Paste"),
        (r'undo', "Undo"), (r'redo', "Redo"),
        (r'fullscreen', "Fullscreen"), (r'minimize', "Minimize"),
        (r'maximize', "Maximize"),
        (r'next', "Next"), (r'prev', "Previous"),
        (r'open', "Open"), (r'close', "Close"),
        (r'lock', "Lock"), (r'unlock', "Unlock"),
        (r'pin', "Pin"), (r'unpin', "Unpin"),
        (r'favorite', "Favorite"), (r'bookmark', "Bookmark"),
        (r'send', "Send"), (r'apply', "Apply"),
        (r'reset', "Reset"), (r'clear', "Clear"),
        (r'mute', "Mute"), (r'unmute', "Unmute"),
        (r'zoom', "Zoom"),
        (r'login', "Sign in"), (r'logout', "Sign out"),
        (r'sign.in', "Sign in"), (r'sign.out', "Sign out"),
        (r'update', "Update"), (r'upgrade', "Upgrade"),
        (r'dismiss', "Dismiss"), (r'retry', "Retry"),
        (r'accept', "Accept"), (r'decline', "Decline"),
        (r'approve', "Approve"), (r'reject', "Reject"),
        (r'start', "Start"), (r'end', "End"),
        (r'pause', "Pause"), (r'resume', "Resume"),
        (r'rewind', "Rewind"), (r'forward', "Forward"),
        (r'queue', "Add to queue"),
        (r'preview', "Preview"), (r'inspect', "Inspect"),
        (r'move', "Move"), (r'reorder', "Reorder"),
        (r'duplicate', "Duplicate"), (r'clone', "Clone"),
        (r'group', "Group"), (r'ungroup', "Ungroup"),
    ]

    for pattern, tooltip in patterns:
        if re.search(pattern, cls) and tooltip:
            return tooltip
    return None


def get_onclick_tooltip(line):
    """Get tooltip from onClick handler name."""
    m = re.search(r'onClick=\{(\w+)', line)
    if not m:
        return None
    handler = m.group(1)

    mappings = [
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
        (r'login|Login|signIn|SignIn', "Sign in"),
        (r'logout|Logout|signOut|SignOut', "Sign out"),
        (r'start|Start', "Start"), (r'end|End', "End"),
        (r'reset|Reset', "Reset"), (r'clear|Clear', "Clear"),
        (r'expand|Expand', "Expand"), (r'collapse|Collapse', "Collapse"),
        (r'fullscreen|Fullscreen', "Toggle fullscreen"),
        (r'dismiss|Dismiss', "Dismiss"),
        (r'retry|Retry', "Retry"),
        (r'update|Update', "Update"),
        (r'apply|Apply', "Apply"),
        (r'push|Push', "Push"),
        (r'preview|Preview', "Preview"),
        (r'zoom|Zoom', "Zoom"),
        (r'move|Move', "Move"),
        (r'reorder|Reorder', "Reorder"),
        (r'duplicate|Duplicate', "Duplicate"),
        (r'pin|Pin', "Pin"),
        (r'favorite|Favorite', "Toggle favorite"),
        (r'queue|Queue', "Add to queue"),
        (r'lock|Lock', "Lock"),
        (r'unlock|Unlock', "Unlock"),
        (r'open|Open', "Open"),
        (r'mute|Mute', "Mute"),
        (r'accept|Accept', "Accept"),
        (r'decline|Decline', "Decline"),
        (r'resume|Resume', "Resume"),
    ]

    for pattern, tooltip in mappings:
        if re.search(pattern, handler, re.IGNORECASE):
            return tooltip
    return None


def generate_tooltip(line):
    """Generate a meaningful tooltip for a button line. Returns None if can't determine."""
    # Priority 1: aria-label (most reliable)
    tooltip = get_aria_label(line)
    if tooltip:
        return tooltip

    # Priority 2: text content
    tooltip = get_text_content(line)
    if tooltip:
        return tooltip

    # Priority 3: className pattern
    tooltip = get_class_tooltip(line)
    if tooltip:
        return tooltip

    # Priority 4: onClick handler
    tooltip = get_onclick_tooltip(line)
    if tooltip:
        return tooltip

    # Priority 5: Icon name
    icon = get_icon_name(line)
    if icon and icon in ICON_TOOLTIPS:
        return ICON_TOOLTIPS[icon]

    return None


def process_file(filepath):
    """Process a single file. Only handles single-line button opening tags."""
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        return 0, 0, str(e)

    lines = content.split("\n")
    changes = 0
    skipped = 0
    new_lines = []

    for line in lines:
        # Check if line contains a <button opening tag
        if not re.search(r'<[Bb]utton[\s>]', line):
            new_lines.append(line)
            continue

        # Check if it's a closing tag
        if re.search(r'</[Bb]utton>', line) and not re.search(r'<[Bb]utton[\s>]', line):
            new_lines.append(line)
            continue

        # Check if this is a single-line tag (has both <button...> and content/closing)
        tag_match = re.search(r'<[Bb]utton\b', line)
        if not tag_match:
            new_lines.append(line)
            continue

        # Skip if already has a meaningful title (not placeholder "Button")
        if re.search(r'title="[^"]+"', line) and 'title="Button"' not in line:
            new_lines.append(line)
            continue
        if re.search(r'title=\{[^}]+\}', line):
            new_lines.append(line)
            continue

        # Find the > that closes the opening tag
        insert_pos = find_safe_insert_point(line)
        if insert_pos is None:
            skipped += 1
            new_lines.append(line)
            continue

        # Generate tooltip
        tooltip = generate_tooltip(line)
        if not tooltip:
            skipped += 1
            new_lines.append(line)
            continue

        # Escape quotes
        tooltip = tooltip.replace('"', '\\"')

        # Check if there's already a placeholder title="Button" to replace
        if 'title="Button"' in line:
            line = line.replace('title="Button"', f'title="{tooltip}"')
            changes += 1
            new_lines.append(line)
            continue

        # Insert title before the >
        new_line = line[:insert_pos] + f' title="{tooltip}"' + line[insert_pos:]
        changes += 1
        new_lines.append(new_line)

    if changes > 0:
        filepath.write_text("\n".join(new_lines), encoding="utf-8")

    return changes, skipped, None


def main():
    tsx_files = sorted(SRC_DIR.rglob("*.tsx"))
    total_changes = 0
    total_skipped = 0
    files_changed = 0
    errors = []

    for fp in tsx_files:
        if "_removed" in str(fp) or ".backup" in str(fp):
            continue
        changes, skipped, err = process_file(fp)
        if err:
            errors.append(f"  {fp.relative_to(SRC_DIR)}: {err}")
        if changes > 0:
            rel = fp.relative_to(SRC_DIR)
            print(f"  ✅ {rel}: +{changes} titles (skipped {skipped})")
            total_changes += changes
            files_changed += 1
        total_skipped += skipped

    print(f"\n{'='*60}")
    print(f"  Total titles added/fixed: {total_changes}")
    print(f"  Total buttons skipped: {total_skipped}")
    print(f"  Files modified: {files_changed}")
    if errors:
        print(f"\n  Errors ({len(errors)}):")
        for e in errors:
            print(e)
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

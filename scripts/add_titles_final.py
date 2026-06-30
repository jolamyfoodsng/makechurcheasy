#!/usr/bin/env python3
"""
Final pass: Add titles to all remaining buttons across the codebase.
Handles multi-line button tags by inserting title= before the closing >.
Uses context-aware heuristic: text content, aria-label, icon name, className, onClick handler.
"""
import re
import sys
import os

SRC = os.path.join(os.path.dirname(__file__), '..', 'src')

# Skip these already-complete files
SKIP_FILES = set()

def find_all_tsx_files():
    files = []
    for root, dirs, filenames in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'dist')]
        for f in filenames:
            if f.endswith('.tsx') and not f.endswith('.d.ts'):
                path = os.path.join(root, f)
                if path not in SKIP_FILES:
                    files.append(path)
    return files

def count_buttons(content):
    return len(re.findall(r'<button[\s>]', content))

def count_titled(content):
    # Count buttons that have title= somewhere before their closing >
    titled = 0
    # Find each button opening tag (may be multi-line)
    for m in re.finditer(r'<button\b([^>]*?)(/>|>)', content, re.DOTALL):
        attrs = m.group(1)
        if re.search(r'\btitle\s*=', attrs):
            titled += 1
    return titled

def extract_text_content(content, tag_start):
    """Extract text content between a button's opening tag and closing tag."""
    # Find the closing > after tag_start
    depth = 0
    i = tag_start
    while i < len(content):
        if content[i] == '>':
            break
        i += 1
    i += 1  # skip >
    
    # Now extract text until </button>
    end = content.find('</button>', i)
    if end == -1:
        return ""
    text = content[i:end].strip()
    # Remove JSX expressions, icons, etc.
    text = re.sub(r'\{[^}]*\}', '', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.strip()
    return text

def guess_title(content, tag_match):
    """Generate a title for a button based on its context."""
    attrs = tag_match.group(1) if tag_match.lastindex else ""
    tag_start = tag_match.start()
    full_match = tag_match.group(0)
    
    # Check for existing aria-label
    aria = re.search(r'aria-label\s*=\s*["\']([^"\']+)["\']', attrs)
    if aria:
        return aria.group(1)
    
    # Extract text content after the tag
    text = extract_text_content(content, tag_start)
    if text and len(text) < 60 and not text.startswith('{'):
        return text
    
    # Check for Icon name= pattern
    icon = re.search(r'<Icon\s+name=["\']([^"\']+)["\']', content[tag_start:tag_start+500])
    
    # Check onClick handler name
    onClick = re.search(r'onClick\s*=\s*\{?\s*(?:\(\)\s*=>\s*)?(\w+)', attrs)
    handler = onClick.group(1) if onClick else ""
    
    # Check className for clues
    className = re.search(r'className=["\']([^"\']+)["\']', attrs)
    cls = className.group(1) if className else ""
    
    # Context: look at surrounding lines
    line_start = content.rfind('\n', 0, tag_start) + 1
    line_end = content.find('\n', tag_start)
    if line_end == -1:
        line_end = len(content)
    # Look at 2 lines before
    prev_lines_start = content.rfind('\n', 0, line_start - 1) + 1
    context = content[prev_lines_start:line_end].strip()
    
    # Map common icon names to titles
    icon_titles = {
        'add': 'Add',
        'add_circle': 'Add',
        'close': 'Close',
        'delete': 'Delete',
        'edit': 'Edit',
        'search': 'Search',
        'settings': 'Settings',
        'play_arrow': 'Play',
        'pause': 'Pause',
        'stop': 'Stop',
        'refresh': 'Refresh',
        'refresh_cw': 'Refresh',
        'save': 'Save',
        'download': 'Download',
        'upload': 'Upload',
        'check': 'Confirm',
        'check_circle': 'Confirm',
        'arrow_back': 'Go back',
        'arrow_forward': 'Next',
        'chevron_left': 'Go back',
        'chevron_right': 'Next',
        'expand_more': 'Expand',
        'expand_less': 'Collapse',
        'menu': 'Menu',
        'more_vert': 'More options',
        'more_horiz': 'More options',
        'visibility': 'Show',
        'visibility_off': 'Hide',
        'lock': 'Lock',
        'lock_open': 'Unlock',
        'content_copy': 'Copy',
        'content_paste': 'Paste',
        'content_cut': 'Cut',
        'undo': 'Undo',
        'redo': 'Redo',
        'zoom_in': 'Zoom in',
        'zoom_out': 'Zoom out',
        'open_in_new': 'Open link',
        'logout': 'Sign out',
        'login': 'Sign in',
        'person': 'Profile',
        'group': 'People',
        'church': 'Church',
        'library_music': 'Music library',
        'menu_book': 'Bible',
        'slideshow': 'Slides',
        'videocam': 'Camera',
        'mic': 'Microphone',
        'volume_up': 'Volume',
        'volume_off': 'Mute',
        'cast': 'Cast',
        'fullscreen': 'Fullscreen',
        'fullscreen_exit': 'Exit fullscreen',
        'picture_in_picture_alt': 'Picture in picture',
        'graphic_eq': 'Audio',
        'tune': 'Adjust settings',
        'palette': 'Colors',
        'text_fields': 'Text',
        'format_size': 'Font size',
        'format_bold': 'Bold',
        'format_italic': 'Italic',
        'format_color_text': 'Text color',
        'border_color': 'Border color',
        'photo': 'Image',
        'image': 'Image',
        'crop': 'Crop',
        'flip': 'Flip',
        'rotate_right': 'Rotate',
        'delete_forever': 'Delete permanently',
        'drag_indicator': 'Drag to reorder',
        'drag_handle': 'Drag to reorder',
        'reorder': 'Drag to reorder',
        'vertical_align_top': 'Align to top',
        'vertical_align_bottom': 'Align to bottom',
        'horizontal_align_center': 'Center',
        'filter_list': 'Filter',
        'sort': 'Sort',
        'clear': 'Clear',
        'warning': 'Warning',
        'info': 'Info',
        'help': 'Help',
        'share': 'Share',
        'link': 'Link',
        'email': 'Email',
        'phone': 'Phone',
        'chat': 'Chat',
        'notifications': 'Notifications',
        'star': 'Favorite',
        'star_border': 'Add to favorites',
        'bookmark': 'Bookmark',
        'schedule': 'Schedule',
        'calendar_today': 'Calendar',
        'cloud': 'Cloud',
        'cloud_upload': 'Upload to cloud',
        'cloud_download': 'Download from cloud',
        'sync': 'Sync',
        'update': 'Update',
        'install_mobile': 'Install',
        'uninstall': 'Uninstall',
        'science': 'Test',
        'bug_report': 'Report bug',
        'code': 'Code',
        'terminal': 'Terminal',
        'folder': 'Folder',
        'folder_open': 'Open folder',
        'file_copy': 'Duplicate',
        'note_add': 'Add note',
        'create_new_folder': 'New folder',
    }
    
    if icon:
        icon_name = icon.group(1)
        if icon_name in icon_titles:
            base = icon_titles[icon_name]
            # Add context from className
            if 'danger' in cls or 'delete' in cls.lower() or 'remove' in cls.lower():
                return f'{base} permanently'
            if 'cancel' in cls.lower():
                return f'Cancel'
            if 'submit' in cls.lower() or 'primary' in cls.lower():
                return f'Confirm'
            return base
    
    # Map common className patterns
    cls_lower = cls.lower()
    if 'close' in cls_lower: return 'Close'
    if 'cancel' in cls_lower: return 'Cancel'
    if 'delete' in cls_lower or 'remove' in cls_lower: return 'Delete'
    if 'submit' in cls_lower: return 'Submit'
    if 'save' in cls_lower: return 'Save'
    if 'add' in cls_lower: return 'Add'
    if 'edit' in cls_lower: return 'Edit'
    if 'back' in cls_lower: return 'Go back'
    if 'next' in cls_lower: return 'Next'
    if 'prev' in cls_lower: return 'Previous'
    if 'refresh' in cls_lower: return 'Refresh'
    if 'retry' in cls_lower: return 'Retry'
    if 'confirm' in cls_lower: return 'Confirm'
    if 'expand' in cls_lower: return 'Expand'
    if 'collapse' in cls_lower: return 'Collapse'
    if 'toggle' in cls_lower: return 'Toggle'
    if 'menu' in cls_lower: return 'Menu'
    if 'tab' in cls_lower: return 'Tab'
    if 'play' in cls_lower: return 'Play'
    if 'pause' in cls_lower: return 'Pause'
    if 'stop' in cls_lower: return 'Stop'
    if 'select' in cls_lower: return 'Select'
    if 'filter' in cls_lower: return 'Filter'
    if 'search' in cls_lower: return 'Search'
    if 'send' in cls_lower: return 'Send'
    if 'copy' in cls_lower: return 'Copy'
    if 'paste' in cls_lower: return 'Paste'
    if 'download' in cls_lower: return 'Download'
    if 'upload' in cls_lower: return 'Upload'
    if 'connect' in cls_lower: return 'Connect'
    if 'disconnect' in cls_lower: return 'Disconnect'
    if 'login' in cls_lower or 'sign-in' in cls_lower: return 'Sign in'
    if 'signup' in cls_lower or 'sign-up' in cls_lower: return 'Sign up'
    if 'submit' in cls_lower: return 'Submit'
    if 'primary' in cls_lower: return 'Confirm'
    if 'secondary' in cls_lower: return 'Cancel'
    if 'ghost' in cls_lower: return 'Cancel'
    if 'danger' in cls_lower: return 'Delete'
    if 'link' in cls_lower: return 'Open link'
    
    # Handler name mapping
    handler_map = {
        'handleClose': 'Close',
        'handleCancel': 'Cancel',
        'handleDelete': 'Delete',
        'handleRemove': 'Remove',
        'handleSave': 'Save',
        'handleSubmit': 'Submit',
        'handleAdd': 'Add',
        'handleEdit': 'Edit',
        'handleUpdate': 'Update',
        'handleRefresh': 'Refresh',
        'handleRetry': 'Retry',
        'handleBack': 'Go back',
        'handleNext': 'Next',
        'handlePrevious': 'Previous',
        'handleCopy': 'Copy',
        'handlePaste': 'Paste',
        'handleUndo': 'Undo',
        'handleRedo': 'Redo',
        'handleSearch': 'Search',
        'handleFilter': 'Filter',
        'handleSort': 'Sort',
        'handlePlay': 'Play',
        'handlePause': 'Pause',
        'handleStop': 'Stop',
        'handleStart': 'Start',
        'handleConnect': 'Connect',
        'handleDisconnect': 'Disconnect',
        'handleToggle': 'Toggle',
        'handleExpand': 'Expand',
        'handleCollapse': 'Collapse',
        'handleSelect': 'Select',
        'handleSend': 'Send',
        'handleDownload': 'Download',
        'handleUpload': 'Upload',
        'handleShare': 'Share',
        'handleLock': 'Lock',
        'handleUnlock': 'Unlock',
        'handleHide': 'Hide',
        'handleShow': 'Show',
        'handleOpen': 'Open',
        'handleLogin': 'Sign in',
        'handleLogout': 'Sign out',
        'handleSignUp': 'Sign up',
        'handleClear': 'Clear',
        'handleReset': 'Reset',
        'handleApply': 'Apply',
        'handleConfirm': 'Confirm',
        'handleSkip': 'Skip',
        'handleFinish': 'Finish',
        'handleQuit': 'Quit',
        'handleMerge': 'Merge',
        'handleSplit': 'Split',
        'handleDuplicate': 'Duplicate',
        'handleMoveUp': 'Move up',
        'handleMoveDown': 'Move down',
        'handleZoomIn': 'Zoom in',
        'handleZoomOut': 'Zoom out',
    }
    
    if handler:
        for prefix, title in handler_map.items():
            if handler.startswith(prefix):
                return title
        # Generic: convert camelCase to words
        words = re.sub(r'([A-Z])', r' \1', handler).strip().title()
        if len(words) < 40:
            return words
    
    # Fallback: try to use the first meaningful className word
    if cls:
        words = re.split(r'[-_\s]+', cls_lower)
        meaningful = [w for w in words if len(w) > 2 and w not in ('btn', 'button', 'ssm', 'tl', 'ob', 'mv', 'sc', 'icon', 'wrap', 'container', 'item', 'row', 'col', 'grid', 'list', 'group', 'content', 'header', 'footer', 'body', 'inner', 'outer', 'left', 'right', 'top', 'bottom', 'start', 'end')]
        if meaningful:
            return meaningful[0].title()
    
    return None

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Find all button opening tags
    # We need to handle multi-line tags
    pattern = re.compile(r'<button\b([^>]*?)(/>|>)', re.DOTALL)
    
    changes = 0
    new_content_parts = []
    last_end = 0
    
    for m in pattern.finditer(content):
        attrs = m.group(1)
        closing = m.group(2)
        
        # Skip if already has title
        if re.search(r'\btitle\s*=', attrs):
            continue
        
        # Skip disabled buttons (often decorative)
        if 'disabled' in attrs and 'aria-label' not in attrs:
            # Still try to add a title
            pass
        
        title = guess_title(content, m)
        if not title:
            continue
        
        # Escape quotes in title
        title_escaped = title.replace('"', '&quot;')
        
        # Insert title attribute before closing /> or >
        insert_pos = m.start(2)
        new_content = content[:insert_pos] + f' title="{title_escaped}"' + content[insert_pos:]
        content = new_content
        changes += 1
    
    if changes > 0:
        with open(filepath, 'w') as f:
            f.write(content)
    
    return changes

def main():
    files = find_all_tsx_files()
    total_added = 0
    files_changed = 0
    
    for filepath in sorted(files):
        with open(filepath, 'r') as f:
            content = f.read()
        
        total_btns = count_buttons(content)
        titled = count_titled(content)
        
        if total_btns == 0 or titled >= total_btns:
            continue
        
        changes = process_file(filepath)
        if changes > 0:
            files_changed += 1
            total_added += changes
            
            # Re-count
            with open(filepath, 'r') as f:
                new_content = f.read()
            new_titled = count_titled(new_content)
            rel = os.path.relpath(filepath, os.path.join(SRC, '..'))
            print(f"  {rel}: +{changes} titles ({titled} -> {new_titled}/{total_btns})")
    
    print(f"\nTotal: +{total_added} titles across {files_changed} files")

if __name__ == '__main__':
    main()

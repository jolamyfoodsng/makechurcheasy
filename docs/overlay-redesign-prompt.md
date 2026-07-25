You need to completely redesign the Fullscreen ↔ Lower Third architecture of mce-bible-overlay.

Do not patch the current transition system.

Destroy the current approach that switches modes by rebuilding, resizing, recalculating, restaging, or waiting for OBS.

The new architecture must follow the same principle used by professional broadcast overlay systems:

THE BROWSER SOURCE IS A PERMANENT RENDER ENGINE.

OBS Browser Source loads mce-bible-overlay.html once and keeps it alive.

After loading:

- OBS is no longer involved in Full/LT switching.
- OBS WebSocket is not used for mode changes.
- No source resizing.
- No browser refresh.
- No URL update.
- No source disable/enable.
- No scene-item transform changes.

The browser owns the transition.

==================================================
NEW ARCHITECTURE
==================================================

Create two permanent rendering layers inside mce-bible-overlay.html:

1. Fullscreen Layer
2. Lower Third Layer


Structure:

<div id="overlay-root">

    <div id="fullscreen-layer" class="overlay-layer">
        Fullscreen Bible renderer
    </div>

    <div id="lower-third-layer" class="overlay-layer">
        Lower Third Bible renderer
    </div>

</div>


Both layers must:

- Always exist.
- Always occupy the full 1920x1080 canvas.
- Never change width/height.
- Never resize the browser source.
- Never be created or destroyed during switching.


CSS:

.overlay-layer {
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    opacity:0;
    pointer-events:none;
}


Only opacity changes:

.active {
    opacity:1;
}


The mode switch is ONLY:

Fullscreen visible:
opacity 1

Lower Third hidden:
opacity 0


Switching:

Full → LT

old:
fullscreen opacity 1

new:
lower-third opacity 0

transition:

fullscreen opacity 0
lower-third opacity 1


No layout recalculation during the click.


==================================================
REMOVE CURRENT BEHAVIOUR
==================================================

Delete the current Full/LT switching logic that does any of these:

- rebuilds Bible HTML
- calls renderFullscreen()
- calls renderLowerThird()
- recalculates font size
- calls autoFitText()
- runs ResizeObserver fitting
- reloads themes
- reapplies backgrounds
- changes container dimensions
- waits for fonts
- waits for OBS acknowledgement
- sends complete overlay packets


A mode click must never call:

- OBS WebSocket
- dockObsClient
- pushBible
- pushBibleOverlayFast
- stageVerse
- ensureObsConnected


==================================================
DATA FLOW
==================================================


There are now only two types of messages.


MESSAGE TYPE 1:
overlay-update

Purpose:
Update Bible content.


Example:

{
    type:"overlay-update",
    channel:"bible",

    revision:100,

    verse:"The centurion answered...",
    reference:"Matthew 8:8",

    fullscreenTheme:{},
    lowerThirdTheme:{},

    background:{},

    compare:{}
}


When received:

Update BOTH layers.

Never update only the visible layer.


Example:

processOverlayUpdate(data){

    currentBibleState=data;

    renderFullscreen(data);

    renderLowerThird(data);

}


After this:

Both layers contain the same verse.


==================================================


MESSAGE TYPE 2:
mode-change

Purpose:
Only change visibility.


Example:

{
    type:"mode-change",
    channel:"bible",
    mode:"fullscreen"
}


When received:

DO NOT:

- render verse
- rebuild HTML
- apply theme
- fit text


Only:

setActiveLayer(mode);


Example:

function setActiveLayer(mode){

    if(mode==="fullscreen"){

        fullscreenLayer.classList.add("active");

        lowerThirdLayer.classList.remove("active");

    }


    if(mode==="lower-third"){

        lowerThirdLayer.classList.add("active");

        fullscreenLayer.classList.remove("active");

    }

}


This should execute in milliseconds.


==================================================
COMMUNICATION
==================================================


Use the existing localhost relay.

Architecture:

DockBibleTab
        |
        |
overlayBridge.publish()
        |
        |
127.0.0.1 relay
        |
        |
mce-bible-overlay.html


No OBS WebSocket.


The relay keeps one persistent connection.

No reconnect on every click.


==================================================
DOCKBIBLETAB
==================================================


handleOverlayModeChange should become extremely simple.


Remove:

ensureObsConnected()

Remove:

dockObsClient.switchBibleOverlayMode()


Replace with:


function handleOverlayModeChange(nextMode){

    if(nextMode===overlayMode)
        return;


    setOverlayMode(nextMode);

    saveDockBibleOverlayMode(nextMode);


    overlayBridge.publish({

        type:"mode-change",

        channel:"bible",

        mode:nextMode,

        revision:Date.now()

    });

}


That is all.

No async.
No await.
No loading.
No error.


The button click should immediately update the UI.


==================================================
VERSE UPDATE FLOW
==================================================


When a new verse is presented:


DockBibleTab sends:


overlayBridge.publish({

 type:"overlay-update",

 channel:"bible",

 revision:newRevision,

 verseText,

 referenceText,

 fullscreenTheme,

 lowerThirdTheme

});


The browser receives it.


It updates:

fullscreen-layer

AND

lower-third-layer


Then the next Full/LT click is instant.


==================================================
STATE MANAGEMENT
==================================================


mce-bible-overlay owns:

currentBibleState

activeMode


Example:


let currentBibleState=null;

let activeMode="fullscreen";


Do not duplicate state between:

- React
- OBS
- browser
- localStorage


The browser is the renderer.


==================================================
IMPORTANT PERFORMANCE RULES
==================================================


A Full/LT click must produce:


Dock:

1 function call

↓

Relay:

1 websocket message

↓

Browser:

1 class toggle


Nothing else.

No:

OBS request

No:

DOM rebuild

No:

font calculation

No:

theme calculation

No:

background reload


==================================================
REFERENCE IMPLEMENTATION IDEA
==================================================


Learn from bible_song/BSP_display architecture:

They keep one display page alive.

They use messages to update the display.

They do not reload the browser.

However, improve on it:

Do not rebuild the entire display during mode switching.

Keep two prepared layers.

==================================================
FINAL ACCEPTANCE TEST
==================================================


Test:

Full
→ LT
→ Full
→ LT
→ Full


Expected:

Every switch:

- starts immediately
- no flicker
- no lag
- same verse remains visible
- no OBS websocket activity
- no browser refresh
- no resizing


Console should show only:


[Mode] fullscreen
[Mode] lower-third
[Mode] fullscreen
[Mode] lower-third


Nothing else.


If any Full/LT click causes:

OBS logs,
font fitting,
verse rebuilding,
theme applying,
source manipulation,

the implementation is wrong.

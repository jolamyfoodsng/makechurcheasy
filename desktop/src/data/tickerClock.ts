/**
 * tickerClock.ts — live time for tickers whose heading shows the clock
 * (markup: <span data-live-clock>{{clock}}</span>, e.g. the "Sunrise Clock" ticker).
 *
 * {{clock}} is filled with the time when the ticker is rendered, so script-free
 * previews still show a sensible time; TICKER_CLOCK_SCRIPT then keeps it ticking in
 * OBS and in previews that allow scripts. Uses the computer's own 12/24-hour setting.
 */
export function formatTickerClock(date: Date = new Date()): string {
  try {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return date.toTimeString().slice(0, 5);
  }
}

export const TICKER_CLOCK_SCRIPT = `<script>(function(){function t(){var s;try{s=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}catch(e){s=new Date().toTimeString().slice(0,5)}var n=document.querySelectorAll("[data-live-clock]");for(var i=0;i<n.length;i++){if(n[i].textContent!==s)n[i].textContent=s}}t();setInterval(t,1000)})();</script>`;

/** True when the ticker markup has a live clock to keep updated. */
export function hasTickerClock(html: string): boolean {
  return html.includes("data-live-clock");
}

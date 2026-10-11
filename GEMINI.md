# Make Church Eazy (MCE) - Workspace Guidelines & Rules

## 🚫 CRITICAL VOCABULARY RULE: NEVER USE THE WORD "SANCTUARY"

> [!CAUTION]
> **STRICT BAN ON THE WORD "SANCTUARY"**:
> NEVER use the word **"sanctuary"** anywhere in this project.
> This prohibition applies to:
> - User Interface labels, buttons, cards, modals, tabs, and placeholders
> - Default data, mock data, sample channel or profile names
> - Code identifiers, variable names, functions, type names, or test fixtures
> - Documentation, comments, marketing copy, and email templates
> - AI responses, commit messages, and feature summaries

### Approved Replacement Terminology:
When referring to in-person spaces, church venues, or physical displays:
- Instead of "sanctuary screens" / "sanctuary projectors" ➔ Use **"Church screens"**, **"Auditorium screens"**, or **"In-person displays"**
- Instead of "sanctuary service" ➔ Use **"Main service"**, **"Sunday service"**, or **"Church service"**
- Instead of "sanctuary stream" ➔ Use **"Live stream"**, **"Church broadcast"**, or **"Auditorium feed"**
- Instead of "sanctuary PC" ➔ Use **"Media PC"**, **"Broadcast PC"**, or **"Church PC"**
- Instead of "people in the sanctuary" ➔ Use **"Congregation"**, **"In-person audience"**, or **"Auditorium"**

---

## 📡 Live Broadcast & OBS Stream Settings
- Never expose internal cloud infrastructure vendors (e.g. Cloudflare) to the end user. Frame as Make Church Eazy's built-in cloud broadcasting engine.
- For YouTube stream destinations, allow server options matching OBS Studio (`auto`, `Primary YouTube ingest server`, `Backup YouTube ingest server`).

import { adminTemporaryPlanGrantedEmail } from "./src/lib/emailTemplates";
const e = adminTemporaryPlanGrantedEmail({ userName: "Eborka precious", userEmail: "x@example.com", previousPlan: "Free", newPlan: "Growth", expiresAt: "2026-11-10T00:00:00Z" });
const html = e.html.replace(/\{\{brand\.primaryColor\}\}/g, "#2563EB").replace(/\{\{brand\.accentColor\}\}/g, "#F97316").replace(/\{\{[^}]+\}\}/g, "");
require("fs").writeFileSync(process.env.HOME + "/mnt/makechurcheasy/.tmp-email-preview.html", html);
console.log(e.subject);

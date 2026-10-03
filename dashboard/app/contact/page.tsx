import type { Metadata } from "next";
import { socialPreview } from "@/lib/social-preview";
import Link from "next/link";
import { ArrowRight, BookOpen, ChevronDown, Download, Mail, MessageCircle, Send } from "lucide-react";
import { MarketingFooter, MarketingHeader } from "../marketing-shell";
import shared from "../homepage.module.css";
import styles from "./contact.module.css";

const description = "Contact the MakeChurchEazy team for help with OBS setup, church presentations, your account, or choosing a plan. Find support, community links, and answers to common questions.";
export const metadata: Metadata = {
  title: "Contact us",
  description,
  alternates: { canonical: "/contact" },
  openGraph: { images: [socialPreview], title: "Contact the MakeChurchEazy team", description, url: "/contact" },
};

const channels = [
  { icon: Mail, title: "Email our team", description: "Questions about your setup, account, or plan? Tell us what you need.", label: "support@makechurcheazy.com", href: "mailto:support@makechurcheazy.com" },
  { icon: MessageCircle, title: "Join the community", description: "Meet other church media teams and share your Sunday workflow.", label: "Join us on WhatsApp", href: "https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t" },
  { icon: Send, title: "Connect on Telegram", description: "Stay connected with the MakeChurchEazy community on Telegram.", label: "Open Telegram", href: "https://t.me/makechurcheasy" },
  { icon: BookOpen, title: "Find a helpful guide", description: "Get practical instructions for OBS, Bible verses, worship lyrics, and more.", label: "Browse documentation", href: "/docs" },
];

const faqs = [
  { question: "I'm new to MakeChurchEazy. Where do I start?", answer: <>Start with the <Link href="/download">desktop download</Link>, then follow our <Link href="/docs">setup guides</Link> to connect MakeChurchEazy to OBS. You can bring Bible verses, worship lyrics, media, and lower thirds into your service workflow. If you are unsure where to begin, email us with a little about your church’s setup.</> },
  { question: "Do I need to create OBS scenes and sources myself?", answer: <>Automatic OBS setup is included on paid plans. Connect MakeChurchEazy to OBS and choose your content; MakeChurchEazy creates, manages, and updates the scenes and sources its presentation workflow needs. See the <Link href="/pricing">plan comparison</Link> for what is included.</> },
  { question: "Can you help me choose a plan for my church?", answer: <>Yes. Email <a href="mailto:support@makechurcheazy.com?subject=Help%20choosing%20a%20plan">our team</a> with the features you need and how your church presents or livestreams its services. You can also <Link href="/pricing">compare plans</Link> to review the available features before deciding.</> },
  { question: "What should I include in a support request?", answer: <>Tell us what you were trying to do, what happened, and the steps that led to it. Include your operating system, MakeChurchEazy and OBS versions, and a screenshot or the exact error message if available. Never send passwords, payment card details, or stream keys.</> },
  { question: "Where can I get help with billing or my account?", answer: <>Email <a href="mailto:support@makechurcheazy.com?subject=Account%20and%20billing%20help">support@makechurcheazy.com</a> from the address associated with your account. Explain the issue and include a payment reference if relevant, so our team can identify the payment.</> },
  { question: "Do you have tutorials for volunteers?", answer: <>Yes. Visit our <Link href="/tutorials">tutorials</Link> and <Link href="/docs">documentation</Link> for help using MakeChurchEazy. Share these resources with your media team so everyone can learn the workflow before the next service.</> },
  { question: "How do I report a bug or suggest a feature?", answer: <>Send us an <a href="mailto:support@makechurcheazy.com?subject=Bug%20report%20or%20feature%20suggestion">email</a>. For a bug, describe how to reproduce it and include any error message. For a feature request, tell us what you want to accomplish during a service and how you handle it today.</> },
];

export default function ContactPage() {
  return <div className={shared.home}>
    <a className={shared.skipLink} href="#main">Skip to content</a>
    <MarketingHeader />
    <main id="main" className={styles.page}>
      <section className={styles.intro} aria-labelledby="contact-heading">
        <div className={styles.heading}>
          <img src="/homepage/logo.webp" width="56" height="56" alt="" />
          <p className={styles.eyebrow}>Contact us</p>
          <h1 id="contact-heading">A little help for the people<br className={styles.desktopBreak} /> behind the service.</h1>
          <p>From your first OBS setup to your next Sunday service,<br className={styles.desktopBreak} /> we’re here to help you make church easier.</p>
        </div>
        <div className={styles.channels}>
          {channels.map(({ icon: Icon, ...channel }) => <a key={channel.title} href={channel.href} className={styles.card} {...(channel.href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <span className={styles.icon}><Icon size={24} aria-hidden="true" /></span>
            <h2>{channel.title}</h2>
            <p>{channel.description}</p>
            <span className={styles.cardLink}>{channel.label}<ArrowRight size={16} aria-hidden="true" /></span>
          </a>)}
        </div>
      </section>
      <section className={styles.faq} aria-labelledby="faq-heading">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>A few helpful answers</p>
          <h2 id="faq-heading">Frequently asked questions</h2>
          <p>Getting started, getting connected, and getting the help you need.</p>
        </div>
        <div className={styles.questions}>
          {faqs.map((faq, index) => <details key={faq.question} open={index === 0}>
            <summary><span>{faq.question}</span><ChevronDown size={20} aria-hidden="true" /></summary>
            <div className={styles.answer}>{faq.answer}</div>
          </details>)}
        </div>
        <p className={styles.stillNeed}>Still have a question? <a href="mailto:support@makechurcheazy.com">Talk to our team <ArrowRight size={16} aria-hidden="true" /></a></p>
      </section>
      <section className={styles.cta} aria-labelledby="ready-heading">
        <span className={styles.icon}><Download size={24} aria-hidden="true" /></span>
        <h2 id="ready-heading">Make room for the service.<br />We’ll help with the setup.</h2>
        <p>Bring your scriptures, songs, and visuals together inside OBS.</p>
        <div className={styles.actions}><Link href="/tutorials" className={shared.buttonOutline}>Watch tutorials</Link><Link href="/download" className={shared.button}>Get MakeChurchEazy <ArrowRight size={16} aria-hidden="true" /></Link></div>
      </section>
    </main>
    <MarketingFooter />
  </div>;
}

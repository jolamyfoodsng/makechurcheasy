import * as React from "react";
import {
  ActionButton,
  EmailShell,
  Paragraph,
  SectionHeading,
  SmallMuted,
} from "./_components";

export interface FeatureAnnouncementEmailProps {
  title: string;
  previewText?: string;
  bodyIntro: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  unsubscribeUrl?: string;
}

export default function FeatureAnnouncementEmail({
  title,
  previewText,
  bodyIntro,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  unsubscribeUrl,
}: FeatureAnnouncementEmailProps) {
  return (
    <EmailShell
      preview={previewText || title}
      eyebrow="Product Update"
      title={title}
      intro={bodyIntro}
      footerText="You are receiving this update because product announcements are enabled for your account."
    >
      {bodyHtml ? (
        <div
          style={{ fontSize: 15, lineHeight: 1.7, color: "#334155" }}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : null}
      {ctaLabel && ctaUrl ? (
        <div style={{ marginTop: 22 }}>
          <ActionButton href={ctaUrl} label={ctaLabel} />
        </div>
      ) : null}
      {unsubscribeUrl ? (
        <>
          <SectionHeading>Email preferences</SectionHeading>
          <SmallMuted>
            You can stop receiving product announcements by using the unsubscribe link below.
          </SmallMuted>
          <div style={{ marginTop: 12 }}>
            <ActionButton href={unsubscribeUrl} label="Unsubscribe" tone="secondary" />
          </div>
        </>
      ) : null}
    </EmailShell>
  );
}

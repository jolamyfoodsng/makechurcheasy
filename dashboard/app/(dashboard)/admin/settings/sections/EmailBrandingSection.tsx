"use client";

import { Globe2, Image, Mail, Palette, Save, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, CardHeader, Input, Textarea } from "@/components/ui";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["emailBranding"];
  onChange: (data: PlatformSettings["emailBranding"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

type SocialKey = keyof PlatformSettings["emailBranding"]["social"];

const SOCIAL_FIELDS: Array<{
  key: SocialKey;
  label: string;
  placeholder: string;
}> = [
  { key: "twitterUrl", label: "X / Twitter", placeholder: "https://x.com/yourchurch" },
  { key: "facebookUrl", label: "Facebook", placeholder: "https://facebook.com/yourchurch" },
  { key: "instagramUrl", label: "Instagram", placeholder: "https://instagram.com/yourchurch" },
  { key: "linkedinUrl", label: "LinkedIn", placeholder: "https://linkedin.com/company/yourchurch" },
  { key: "youtubeUrl", label: "YouTube", placeholder: "https://youtube.com/@yourchurch" },
  { key: "whatsappUrl", label: "WhatsApp", placeholder: "https://chat.whatsapp.com/..." },
  { key: "tiktokUrl", label: "TikTok", placeholder: "https://tiktok.com/@yourchurch" },
];

export function EmailBrandingSection({ data, onChange, onSave, saving }: Props) {
  const update = (fields: Partial<PlatformSettings["emailBranding"]>) =>
    onChange({ ...data, ...fields });

  const updateSocial = (key: SocialKey, value: string) =>
    onChange({
      ...data,
      social: {
        ...data.social,
        [key]: value,
      },
    });

  const saveButton = (
    <Button
      size="sm"
      loading={saving}
      onClick={onSave}
      icon={<Save className="w-3.5 h-3.5" />}
    >
      Save
    </Button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Brand & Email</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Control the logo, colors, footer, and social links used in all transactional emails.
        </p>
      </div>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title="Email identity"
            description="These values appear in the header and footer of password reset, billing, trial, and security emails."
            icon={<Mail className="w-4 h-4" />}
            action={saveButton}
          />
        </div>

        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Input
                label="App name"
                value={data.appName}
                onChange={(e) => update({ appName: e.target.value })}
                placeholder="MakeChurchEasy"
              />
              <Input
                label="Support email"
                type="email"
                value={data.supportEmail}
                onChange={(e) => update({ supportEmail: e.target.value })}
                placeholder="support@example.com"
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Input
                label="Website URL"
                value={data.websiteUrl}
                onChange={(e) => update({ websiteUrl: e.target.value })}
                placeholder="https://makechurcheazy.com"
              />
              <Input
                label="Email preferences URL"
                value={data.preferencesUrl}
                onChange={(e) => update({ preferencesUrl: e.target.value })}
                placeholder="https://makechurcheazy.com/settings"
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <Textarea
              label="Footer text"
              value={data.footerText}
              onChange={(e) => update({ footerText: e.target.value })}
              placeholder="Short footer message shown under every email."
              className="min-h-[88px]"
            />
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title="Logo and colors"
            description="Use public HTTPS URLs so email clients can load the logo."
            icon={<Image className="w-4 h-4" />}
          />
        </div>

        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px] gap-4">
              <Input
                label="Logo URL"
                value={data.logoUrl}
                onChange={(e) => update({ logoUrl: e.target.value })}
                placeholder="https://..."
              />
              <Input
                label="Logo alt text"
                value={data.logoAlt}
                onChange={(e) => update({ logoAlt: e.target.value })}
                placeholder="MakeChurchEasy"
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ColorField
                label="Primary color"
                value={data.primaryColor}
                onChange={(value) => update({ primaryColor: value })}
                icon={<Palette className="w-4 h-4" />}
              />
              <ColorField
                label="Accent color"
                value={data.accentColor}
                onChange={(value) => update({ accentColor: value })}
                icon={<Palette className="w-4 h-4" />}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title="Social links"
            description="Leave a URL blank to hide that social link in emails."
            icon={<Share2 className="w-4 h-4" />}
          />
        </div>

        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {SOCIAL_FIELDS.map((field) => (
                <Input
                  key={field.key}
                  label={field.label}
                  value={data.social[field.key]}
                  onChange={(e) => updateSocial(field.key, e.target.value)}
                  placeholder={field.placeholder}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="rounded-2xl border border-slate-800 bg-[#0B101E] p-5 shadow-xl">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <Globe2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">How it is used</h3>
            <p className="text-sm text-slate-400 mt-1 leading-6">
              All current email content stays the same, but it is wrapped inside the new branded
              template. Password reset, login code, trial, subscription, receipt, and admin-managed
              subscription emails all read these settings before sending.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  icon: ReactNode;
  onChange: (value: string) => void;
}

function ColorField({ label, value, icon, onChange }: ColorFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-300">{label}</label>
      <div className="flex h-[44px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
        <div className="w-11 flex items-center justify-center border-r border-slate-800 text-slate-400">
          {icon}
        </div>
        <input
          aria-label={`${label} swatch`}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-12 cursor-pointer border-0 bg-transparent p-1"
        />
        <input
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent px-3 text-sm font-medium text-white outline-none"
          placeholder="#1D4ED8"
        />
      </div>
    </div>
  );
}

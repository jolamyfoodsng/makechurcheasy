"use client";

import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { getUser, updateUser, type User } from "@/lib/api";
import { countries } from "@/lib/countries";
import { getUserId } from "@/lib/userId";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { LOCALES, normalizeLanguageValue } from "@/i18n/routing";
import imageCompression from "browser-image-compression";
import {
  Camera,
  ChevronRight,
  Chrome,
  HelpCircle,
  Loader2,
  Mail
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

export default function ProfileSettings() {
  const t = useTranslations();
  const userId = getUserId();
  const { hasPasswordProvider, isGoogleLinked } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("(GMT+1) West Africa Time");
  const [dirty, setDirty] = useState(false);
  const { Modal } = useUnsavedChanges(dirty);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    getUser(userId)
      .then((u) => {
        if (u) {
          setUser(u);
          setName(u.name ?? "");
          setJobTitle(u.jobTitle ?? "");
          setPhone(u.phone ?? "");
          setCountry(u.country ?? "");
          setLanguage(normalizeLanguageValue(u.language ?? "en"));
          setTimezone(u.timezone ?? "(GMT+1) West Africa Time");
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    const changed =
      name !== (user.name ?? "") ||
      jobTitle !== (user.jobTitle ?? "") ||
      phone !== (user.phone ?? "") ||
      country !== (user.country ?? "") ||
      language !== normalizeLanguageValue(user.language ?? "en") ||
      timezone !== (user.timezone ?? "(GMT+1) West Africa Time");
    setDirty(changed);
  }, [name, jobTitle, phone, country, language, timezone, user]);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await updateUser(userId, { name, jobTitle, phone, country, language, timezone });
      setUser((prev) => prev ? { ...prev, name, jobTitle, phone, country, language, timezone } : prev);
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2000);
    } catch { }
    setSaving(false);
  };

  const handleCancel = () => {
    if (user) {
      setName(user.name ?? "");
      setJobTitle(user.jobTitle ?? "");
      setPhone(user.phone ?? "");
      setCountry(user.country ?? "");
      setLanguage(normalizeLanguageValue(user.language ?? "en"));
      setTimezone(user.timezone ?? "(GMT+1) West Africa Time");
      setDirty(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploadingAvatar(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 512,
        useWebWorker: true,
      });
      const formData = new FormData();
      formData.append("file", compressed, file.name);
      formData.append("type", "avatar");
      const res = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      const { url } = await res.json();
      await updateUser(userId, { avatar: url });
      setUser((prev) => prev ? { ...prev, avatar: url } : prev);
    } catch (err: any) {
      alert(err.message || "Failed to upload avatar");
    }
    setUploadingAvatar(false);
    e.target.value = "";
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto w-full flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6 pb-16">
      <Modal />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("settings.profileSettings")}</h1>
          <p className="text-slate-500 mt-1 text-sm">{t("settings.profileDescription")}</p>
        </div>
        <Button variant="secondary" size="sm" icon={<HelpCircle className="w-4 h-4" />}>
          {t("common.needHelp")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-6 md:space-y-8">
          {/* Personal Information */}
          <Card padding="lg">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{t("settings.personalInformation")}</h2>
                <p className="text-sm text-slate-500 mt-1">{t("settings.personalInfoDescription")}</p>
              </div>
              <Badge variant="success" size="md" dot>{t("common.verified")}</Badge>
            </div>

            <div className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200 shrink-0 hover:border-blue-400 transition-colors cursor-pointer"
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <span className="text-2xl font-bold">{(name || user?.email || "?")[0].toUpperCase()}</span>
                    </div>
                  )}
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-slate-900">{t("settings.profilePhoto")}</p>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors bg-white"
                  >
                    {uploadingAvatar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                    {uploadingAvatar ? t("common.uploading") : t("common.changePhoto")}
                  </button>
                </div>
              </div>

              <Input
                label={t("common.fullName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("settings.accountEmail")}</label>
                <p className="text-xs text-slate-500 mb-2">{t("settings.accountEmailDescription")}</p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1 w-full flex items-center justify-between border border-slate-200 rounded-xl p-3 bg-white">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">{t("settings.email.currentEmail")}</span>
                      <span className="text-sm font-medium text-slate-900 line-clamp-1">{user?.email || "—"}</span>
                    </div>
                    <Badge variant="success" size="sm">{t("common.verified")}</Badge>
                  </div>
                  <Link href="/settings/email" className="w-full sm:w-auto">
                    <Button variant="secondary" size="sm" icon={<Mail className="w-4 h-4" />} className="w-full sm:w-auto whitespace-nowrap">
                      {t("settings.changeEmail")}
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                <Input
                  label={t("common.phoneNumber")}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <Input
                  label={t("settings.position")}
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>

              <Select
                label={t("settings.country")}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                options={[
                  { value: "", label: `— ${t("common.select")} —` },
                  ...countries.map((c) => ({ value: c.code, label: c.name })),
                ]}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
                <Select
                  label={t("settings.language")}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  options={LOCALES.map((l) => ({
                    value: l.code,
                    label: `${l.flag} ${l.nativeName}`,
                  }))}
                />
                <Select
                  label={t("common.timezone")}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  options={[
                    { value: "(GMT+1) West Africa Time", label: "(GMT+1) West Africa Time" },
                    { value: "(GMT+0) Greenwich Mean Time", label: "(GMT+0) Greenwich Mean Time" },
                    { value: "(GMT-5) Eastern Time", label: "(GMT-5) Eastern Time" },
                    { value: "(GMT+8) Singapore Time", label: "(GMT+8) Singapore Time" },
                  ]}
                />
              </div>

              <div className="flex items-center gap-3 pt-6">
                <Button onClick={handleSave} disabled={saving || !dirty}>
                  {saving ? t("common.saving") : saved ? t("common.saved") : t("common.saveChanges")}
                </Button>
                <Button variant="secondary" onClick={handleCancel} disabled={!dirty}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </Card>

          {/* Deactivate Account */}
          {/* <Card padding="lg" className="bg-red-50/50 border-red-100">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div>
                <h3 className="text-base font-bold text-red-600">Deactivate Account</h3>
                <p className="text-sm text-red-800/80 mt-1">Temporarily or permanently deactivate your account and all associated data.</p>
              </div>
              <Link href="/settings/deactivate" className="w-full md:w-auto">
                <Button variant="danger" size="sm" className="w-full md:w-auto whitespace-nowrap">
                  Deactivate Account
                </Button>
              </Link>
            </div>
          </Card> */}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-6 md:space-y-8">
          {/* Login Methods */}
          <Card padding="lg">
            <h2 className="text-lg font-bold text-slate-900">{t("settings.loginMethods")}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-6">{t("settings.loginMethodsDescription")}</p>

            <div className="space-y-4">
              <Link
                href="/security/password"
                className="flex items-center justify-between group hover:bg-slate-50 p-2 -mx-2 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t("settings.emailPassword")}</p>
                    <p className="text-xs text-slate-500">{t("settings.emailPasswordDescription")}</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 shrink-0 w-24">
                  {hasPasswordProvider() ? (
                    <Badge variant="success" size="sm">{t("settings.connected")}</Badge>
                  ) : (
                    <span className="text-[10px] sm:text-xs text-slate-400 font-bold">{t("settings.notSet")}</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
                </div>
              </Link>

              <Link
                href="/settings/google"
                className="flex items-center justify-between group hover:bg-slate-50 p-2 -mx-2 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center shrink-0">
                    <Chrome className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t("settings.googleLabel")}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{t("settings.googleDescription")}</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 shrink-0 w-24">
                  {isGoogleLinked() ? (
                    <Badge variant="success" size="sm">{t("settings.connected")}</Badge>
                  ) : (
                    <span className="text-[10px] sm:text-xs text-slate-400 font-bold text-left leading-tight pr-1">{t("settings.notConnected")}</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
                </div>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

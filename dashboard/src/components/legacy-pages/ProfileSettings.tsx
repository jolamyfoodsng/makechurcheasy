"use client";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  HelpCircle,
  Mail,
  Landmark,
  Users,
  ChevronRight,
  Plus,
  Chrome,
  LayoutGrid,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getUser, updateUser, type User } from "../../lib/api";
import { getUserId } from "../../lib/userId";
import { useTranslations } from "next-intl";
import { countries } from "../../lib/countries";

export default function ProfileSettings() {
  const t = useTranslations();
  const userId = getUserId();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("English");
  const [timezone, setTimezone] = useState("(GMT+1) West Africa Time");

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    getUser(userId)
      .then((u) => {
        if (u) {
          setUser(u);
          setName(u.name ?? "");
          setJobTitle(u.jobTitle ?? "");
          setCountry(u.country ?? "");
          setLanguage(u.language ?? "English");
          setTimezone(u.timezone ?? "(GMT+1) West Africa Time");
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await updateUser(userId, { name, jobTitle, country, language, timezone });
      setUser((prev) => prev ? { ...prev, name, jobTitle, country, language, timezone } : prev);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto w-full flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto w-full space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("profileSettings.title")}</h1>
          <p className="text-slate-500 mt-1 text-sm">{t("profileSettings.description")}</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
          <HelpCircle className="w-4 h-4" /> {t("profileSettings.needHelp")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-6 md:space-y-8">
          {/* Personal Information */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{t("profileSettings.personalInformation")}</h2>
                <p className="text-sm text-slate-500 mt-1">{t("profileSettings.personalInfoDescription")}</p>
              </div>

            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-200 shadow-sm rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm py-2.5 px-3 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("profileSettings.accountEmail")}</label>
                <p className="text-xs text-slate-500 mb-2">{t("profileSettings.accountEmailDescription")}</p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1 w-full flex items-center justify-between border border-slate-200 rounded-lg p-3 bg-white shadow-sm">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">{t("profileSettings.currentEmail")}</span>
                      <span className="text-sm font-medium text-slate-900 line-clamp-1">{user?.email || "—"}</span>
                    </div>

                  </div>
                  <Link
                    to="/settings/email"
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 border border-blue-600 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-50 transition-colors bg-white whitespace-nowrap shadow-sm"
                  >
                    <Mail className="w-4 h-4" /> {t("profileSettings.changeEmailAddress")}
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                    Phone Number <span className="text-slate-400 text-xs font-normal">(Optional)</span>
                  </label>
                  <div className="flex shadow-sm rounded-lg border border-slate-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                    <select className="border-none bg-slate-50 text-sm py-2.5 px-3 rounded-l-lg outline-none w-24 border-r border-slate-200 text-slate-700">
                      <option>🇳🇬 +234</option>
                    </select>
                    <input
                      type="tel"
                      defaultValue={user?.phone ?? ""}
                      className="flex-1 border-none text-sm py-2.5 px-3 rounded-r-lg outline-none w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                    Position in Church <span className="text-slate-400 text-xs font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full border border-slate-200 shadow-sm rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm py-2.5 px-3 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Country</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full border border-slate-200 shadow-sm rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm py-2.5 px-3 outline-none bg-white text-slate-800"
                  >
                    <option value="">Select country</option>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full border border-slate-200 shadow-sm rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm py-2.5 px-3 outline-none bg-white"
                  >
                    <option>English</option>
                    <option>French</option>
                    <option>Spanish</option>
                    <option>Yoruba</option>
                    <option>Igbo</option>
                    <option>Hausa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Time Zone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full border border-slate-200 shadow-sm rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm py-2.5 px-3 outline-none bg-white text-slate-800"
                  >
                    <option>(GMT+1) West Africa Time</option>
                    <option>(GMT+0) Greenwich Mean Time</option>
                    <option>(GMT-5) Eastern Time</option>
                    <option>(GMT+8) Singapore Time</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-6">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
                </button>
                <button className="px-6 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors bg-white shadow-sm">
                  Cancel
                </button>
              </div>
            </div>
          </section>

          {/* Deactivate Account */}
          {/* <section className="bg-red-50/50 border border-red-100 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div>
              <h3 className="text-base font-bold text-red-600">Deactivate Account</h3>
              <p className="text-sm text-red-800/80 mt-1">Temporarily or permanently deactivate your account and all associated data.</p>
            </div>
            <Link to="/settings/deactivate" className="w-full md:w-auto px-5 py-2.5 border border-red-500 text-red-600 rounded-lg text-sm font-bold hover:bg-red-50 transition-colors bg-white whitespace-nowrap shadow-sm text-center">
              Deactivate Account
            </Link>
          </section> */}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-6 md:space-y-8">
          {/* Church Membership */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Church Membership</h2>
            <p className="text-sm text-slate-500 mt-1 mb-6">View your current church and role.</p>

            <div className="flex items-start gap-4 mb-6">
              <div className="relative shrink-0">
                <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center pt-1 shadow-inner">
                  <Landmark className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
                  <Users className="w-3 h-3 text-white" />
                </div>
              </div>
              <div className="flex-1 space-y-3 pt-1">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Current Church</p>
                  <p className="text-sm font-semibold text-slate-900">{user?.churchName || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Your Role</p>
                  <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">
                    {user?.role || "Member"}
                  </span>
                </div>
                {memberSince && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Joined</p>
                    <p className="text-sm font-medium text-slate-800">{memberSince}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Login Methods */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Login Methods</h2>
            <p className="text-sm text-slate-500 mt-1 mb-6">Manage the ways you can sign in to your account.</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between group cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Email & Password</p>
                    <p className="text-xs text-slate-500">Sign in with your email and password</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 shrink-0 w-24">
                  <span className="px-2 py-1 bg-green-50 text-green-700 rounded-md text-[10px] sm:text-xs font-bold">Connected</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
                </div>
              </div>

              <div className="flex items-center justify-between group cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center shrink-0">
                    <Chrome className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Google</p>
                    <p className="text-xs text-slate-500 line-clamp-1">Sign in with your Google account</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 shrink-0 w-24">
                  <span className="text-[10px] sm:text-xs text-slate-400 font-bold text-left leading-tight pr-1">Not<br />Connected</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
                </div>
              </div>


            </div>


          </section>
        </div>
      </div>
    </div>
  );
}

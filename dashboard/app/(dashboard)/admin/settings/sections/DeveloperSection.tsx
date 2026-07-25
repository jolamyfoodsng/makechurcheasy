"use client";

import { useState } from "react";
import { Terminal, Save, Trash2, RefreshCw, Database, FileSearch } from "lucide-react";
import { Card, CardHeader, Button, Toggle, ConfirmDialog } from "@/components/ui";
import { useTranslations } from "next-intl";

interface Props {
  onSave: () => Promise<void>;
  saving: boolean;
}

export function DeveloperSection({ onSave, saving }: Props) {
  const t = useTranslations("admin.settings.developer");
  const tc = useTranslations("common");
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleAction = async (action: string) => {
    setActionLoading(true);
    // TODO: Wire to actual API endpoints
    await new Promise((r) => setTimeout(r, 1500));
    setActionLoading(false);
    setConfirmAction(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {t("description")}
        </p>
      </div>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("cacheManagement")}
            description={t("cacheManagementDescription")}
            icon={<Database className="w-4 h-4" />}
            action={
              <Button
                size="sm"
                loading={saving}
                onClick={onSave}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                {tc("save")}
              </Button>
            }
          />
        </div>
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">{t("flushCache")}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("flushCacheDescription")}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setConfirmAction("flushCache")}
            >
              {t("flush")}
            </Button>
          </div>
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {t("rebuildSearchIndex")}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("rebuildSearchIndexDescription")}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<FileSearch className="w-3.5 h-3.5" />}
              onClick={() => setConfirmAction("rebuildIndex")}
            >
              {t("rebuild")}
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("connectionTesting")}
            description={t("connectionTestingDescription")}
            icon={<RefreshCw className="w-4 h-4" />}
          />
        </div>
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {t("testAllConnections")}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("testAllConnectionsDescription")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => setConfirmAction("testConnections")}
          >
            {t("test")}
          </Button>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("debug")}
            description={t("debugDescription")}
            icon={<Terminal className="w-4 h-4" />}
          />
        </div>
        <div className="px-6 py-4">
          <Toggle
            label={t("verboseLogging")}
            description={t("verboseLoggingDescription")}
            checked={false}
            onChange={() => { }}
          />
        </div>
      </Card>

      <ConfirmDialog
        open={confirmAction === "flushCache"}
        title={t("flushConfirm")}
        description={t("flushConfirmDescription")}
        confirmLabel={t("flushCache")}
        destructive
        loading={actionLoading}
        onConfirm={() => handleAction("flushCache")}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "rebuildIndex"}
        title={t("rebuildConfirm")}
        description={t("rebuildConfirmDescription")}
        confirmLabel={t("rebuild")}
        destructive
        loading={actionLoading}
        onConfirm={() => handleAction("rebuildIndex")}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "testConnections"}
        title={t("testConfirm")}
        description={t("testConfirmDescription")}
        confirmLabel={t("runTests")}
        loading={actionLoading}
        onConfirm={() => handleAction("testConnections")}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

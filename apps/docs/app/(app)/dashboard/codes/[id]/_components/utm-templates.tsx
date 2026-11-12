"use client";
import { useTranslations } from "next-intl";

// Saved UTM templates in the UTM panel: fill the panel from a template, save
// its values as one,
// rename and delete them. Shown only when the workspace's plan has UTM and
// the server has the table (manual-sql/0013); otherwise nothing renders.

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  ArrowDown2,
  DocumentCopy,
  Edit2,
  Save2,
  Setting4,
  Trash,
} from "iconsax-reactjs";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useState,
  useTransition,
} from "react";
import {
  deleteUtmTemplateAction,
  getUtmTemplates,
  renameUtmTemplateAction,
  saveUtmTemplate,
} from "@/actions/utm-templates";
import type { UtmConfig } from "@/lib/redirect/routing";
import {
  isEmptyUtm,
  MAX_UTM_TEMPLATE_NAME,
  MAX_UTM_TEMPLATES,
  type UtmTemplateView,
  utmSummary,
} from "@/lib/utm-templates-shared";

/** Loads the workspace's templates once; null until known (and when off). */
function useUtmTemplates() {
  const [templates, setTemplates] = useState<UtmTemplateView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUtmTemplates()
      .then((result) => {
        if (cancelled) return;
        // Off (no table yet, or not on the plan) and failures look the same:
        // no templates control, the panel works as before.
        if (result.success && result.data.available && result.data.allowed) {
          setTemplates(result.data.templates);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const upsert = useCallback((template: UtmTemplateView) => {
    setTemplates((list) =>
      [
        ...(list ?? []).filter((item) => item.id !== template.id),
        template,
      ].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }, []);
  const remove = useCallback((id: string) => {
    setTemplates((list) => (list ?? []).filter((item) => item.id !== id));
  }, []);

  return { templates, upsert, remove };
}

/**
 * "Templates" menu for the UTM panel's action row. `current` is what the
 * panel holds now (for "Save as template"); `onApply` fills the panel.
 */
export function UtmTemplatesMenu({
  current,
  onApply,
  disabled,
}: {
  current: UtmConfig;
  onApply: (utm: UtmConfig) => void;
  disabled?: boolean;
}) {
  const { templates, upsert, remove } = useUtmTemplates();
  if (templates === null) return null;
  return (
    <UtmTemplatesMenuBody
      current={current}
      disabled={disabled}
      onApply={onApply}
      onRemoved={remove}
      onSaved={upsert}
      templates={templates}
    />
  );
}

/** The menu and its dialogs for loaded templates. */
export function UtmTemplatesMenuBody({
  templates,
  current,
  onApply,
  onSaved,
  onRemoved,
  disabled,
}: {
  templates: UtmTemplateView[];
  current: UtmConfig;
  onApply: (utm: UtmConfig) => void;
  onSaved: (template: UtmTemplateView) => void;
  onRemoved: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("app.dashboard.codes.utmTemplates");
  const [dialog, setDialog] = useState<"save" | "manage" | null>(null);
  const empty = isEmptyUtm(current);
  const full = templates.length >= MAX_UTM_TEMPLATES;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={disabled} size="sm" type="button" variant="outline">
            <DocumentCopy />
            {t("templates")}
            <ArrowDown2 className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            {templates.length > 0
              ? t("fillInFromATemplate")
              : t("noTemplatesInThisWorkspace")}
          </DropdownMenuLabel>
          {templates.map((template) => (
            <DropdownMenuItem
              className="flex-col items-start gap-0.5"
              key={template.id}
              onSelect={() => {
                onApply(template.utm);
                toast.success(t("filledInFromName", { name: template.name }), {
                  description: t("saveTheParametersToUse"),
                });
              }}
            >
              <span className="w-full truncate font-medium">
                {template.name}
              </span>
              <span className="text-muted-foreground w-full truncate font-mono text-xs">
                {utmSummary(template.utm)}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={empty || full}
            onSelect={() => setDialog("save")}
          >
            <Save2 />
            {t("saveAsTemplate")}
          </DropdownMenuItem>
          {templates.length > 0 && (
            <DropdownMenuItem onSelect={() => setDialog("manage")}>
              <Setting4 />
              {t("manageTemplates")}
            </DropdownMenuItem>
          )}
          {(empty || full) && (
            <p className="text-muted-foreground px-2 pb-1.5 text-xs">
              {full
                ? t("aWorkspaceKeepsUpTo", { MAX_UTM_TEMPLATES })
                : t("fillInAParameterTo")}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <SaveTemplateDialog
        current={current}
        onOpenChange={(open) => setDialog(open ? "save" : null)}
        onSaved={onSaved}
        open={dialog === "save"}
      />
      <ManageTemplatesDialog
        onOpenChange={(open) => setDialog(open ? "manage" : null)}
        onRemoved={onRemoved}
        onRenamed={onSaved}
        open={dialog === "manage"}
        templates={templates}
      />
    </>
  );
}

function SaveTemplateDialog({
  open,
  onOpenChange,
  current,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: UtmConfig;
  onSaved: (template: UtmTemplateView) => void;
}) {
  const t = useTranslations("app.dashboard.codes.utmTemplates");
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setName(current.campaign ?? "");
      setError(null);
    }
  }, [open, current.campaign]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveUtmTemplate({ name, utm: current });
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        onSaved(result.data);
        toast.success(t("templateNameSaved", { name: result.data.name }));
        onOpenChange(false);
      } catch {
        setError("Couldn't save the template. Try again.");
      }
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("saveAsTemplate2")}</DialogTitle>
            <DialogDescription>
              {t("everyoneInThisWorkspaceCan")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>{t("name")}</Label>
            <Input
              autoFocus
              id={`${id}-name`}
              maxLength={MAX_UTM_TEMPLATE_NAME}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("springPosters")}
              value={name}
            />
            <p className="text-muted-foreground truncate font-mono text-xs">
              {utmSummary(current)}
            </p>
          </div>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {t("cancel")}
            </Button>
            <Button disabled={isPending || !name.trim()} type="submit">
              {isPending ? t("saving") : t("saveTemplate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageTemplatesDialog({
  open,
  onOpenChange,
  templates,
  onRenamed,
  onRemoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: UtmTemplateView[];
  onRenamed: (template: UtmTemplateView) => void;
  onRemoved: (id: string) => void;
}) {
  const t = useTranslations("app.dashboard.codes.utmTemplates");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setError(null);
    }
  }, [open]);

  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await renameUtmTemplateAction(editing);
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        onRenamed(result.data);
        setEditing(null);
      } catch {
        setError("Couldn't rename the template. Try again.");
      }
    });
  };

  const remove = (template: UtmTemplateView) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteUtmTemplateAction({ id: template.id });
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        onRemoved(template.id);
        toast.success(t("templateNameDeleted", { name: template.name }));
      } catch {
        setError("Couldn't delete the template. Try again.");
      }
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("utmTemplates")}</DialogTitle>
          <DialogDescription>
            {t("renameOrDeleteThisWorkspaces")}
          </DialogDescription>
        </DialogHeader>
        {templates.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {t("noTemplatesLeft")}
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
            {templates.map((template) => (
              <li
                className="flex items-center gap-2 px-3 py-2"
                key={template.id}
              >
                {editing?.id === template.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={rename}
                  >
                    <Input
                      aria-label={t("templateName")}
                      autoFocus
                      className="h-8"
                      maxLength={MAX_UTM_TEMPLATE_NAME}
                      onChange={(event) =>
                        setEditing({
                          id: template.id,
                          name: event.target.value,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setEditing(null);
                        }
                      }}
                      value={editing.name}
                    />
                    <Button
                      disabled={isPending || !editing.name.trim()}
                      size="sm"
                      type="submit"
                    >
                      {t("save")}
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {template.name}
                      </span>
                      <span className="text-muted-foreground block truncate font-mono text-xs">
                        {utmSummary(template.utm)}
                      </span>
                    </span>
                    {template.canEdit && (
                      <>
                        <Button
                          aria-label={t("renameName", { name: template.name })}
                          disabled={isPending}
                          onClick={() =>
                            setEditing({ id: template.id, name: template.name })
                          }
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Edit2 />
                        </Button>
                        <Button
                          aria-label={t("deleteName", { name: template.name })}
                          disabled={isPending}
                          onClick={() => remove(template)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button">
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

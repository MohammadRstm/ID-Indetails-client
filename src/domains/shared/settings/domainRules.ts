import type { DomainSettings } from "../../design/work/workApi";

/** A domain's rules as the API takes them back: every setting, since a save replaces them all. */
export const rulesBody = (r: DomainSettings) => ({
    allowFutureEntries: r.allowFutureEntries, allowOverlap: r.allowOverlap, autoArchive: r.autoArchive, editWindow: r.editWindow,
    holdLogging: r.holdLogging, logReminder: r.logReminder, notifyEntry: r.notifyEntry, notifyIdle: r.notifyIdle,
    notifyProject: r.notifyProject, requireDescription: r.requireDescription, timerEnabled: r.timerEnabled, weeklySummary: r.weeklySummary,
});

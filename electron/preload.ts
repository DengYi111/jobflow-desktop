import { contextBridge, ipcRenderer } from 'electron'
import type { JobFlowApi } from '../src/shared/contracts/api'

const invoke = (channel: string, input?: unknown) => ipcRenderer.invoke(channel, input)

const api: JobFlowApi = {
  changes: {
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, change: Parameters<typeof listener>[0]) =>
        listener(change)
      ipcRenderer.on('jobflow:data.changed', handler)
      return () => ipcRenderer.removeListener('jobflow:data.changed', handler)
    },
  },
  dashboard: {
    getSummary: () => invoke('jobflow:dashboard.getSummary'),
    listDueItems: (range = {}) => invoke('jobflow:dashboard.listDueItems', range),
    getNotificationsEnabled: () => invoke('jobflow:dashboard.getNotificationsEnabled'),
    setNotificationsEnabled: (input) => invoke('jobflow:dashboard.setNotificationsEnabled', input),
  },
  companies: {
    list: (input = {}) => invoke('jobflow:companies.list', input),
    listDirectory: (input = {}) => invoke('jobflow:companies.listDirectory', input),
    addFromDirectory: (input) => invoke('jobflow:companies.addFromDirectory', input),
    create: (input) => invoke('jobflow:companies.create', input),
    update: (input) => invoke('jobflow:companies.update', input),
    get: (input) => invoke('jobflow:companies.get', input),
    archive: (input) => invoke('jobflow:companies.archive', input),
  },
  jobs: {
    list: (input = {}) => invoke('jobflow:jobs.list', input),
    get: (input) => invoke('jobflow:jobs.get', input),
    create: (input) => invoke('jobflow:jobs.create', input),
    update: (input) => invoke('jobflow:jobs.update', input),
    softDelete: (input) => invoke('jobflow:jobs.softDelete', input),
    restore: (input) => invoke('jobflow:jobs.restore', input),
    permanentlyDelete: (input) => invoke('jobflow:jobs.permanentlyDelete', input),
    clearTrash: (input) => invoke('jobflow:jobs.clearTrash', input),
    findDuplicates: (input) => invoke('jobflow:jobs.findDuplicates', input),
    addListing: (input) => invoke('jobflow:jobs.addListing', input),
    updateListing: (input) => invoke('jobflow:jobs.updateListing', input),
  },
  applications: {
    transition: (input) => invoke('jobflow:applications.transition', input),
    submit: (input) => invoke('jobflow:applications.submit', input),
    setResumeVersion: (input) => invoke('jobflow:applications.setResumeVersion', input),
    completeStageAction: (input) => invoke('jobflow:applications.completeStageAction', input),
    completeNextAction: (input) => invoke('jobflow:applications.completeNextAction', input),
    setStageNotification: (input) => invoke('jobflow:applications.setStageNotification', input),
    setNextActionNotification: (input) => invoke('jobflow:applications.setNextActionNotification', input),
    addEvent: (input) => invoke('jobflow:applications.addEvent', input),
    updateEvent: (input) => invoke('jobflow:applications.updateEvent', input),
    deleteEvent: (input) => invoke('jobflow:applications.deleteEvent', input),
    setNextAction: (input) => invoke('jobflow:applications.setNextAction', input),
    listTimeline: (input) => invoke('jobflow:applications.listTimeline', input),
  },
  reminders: {
    create: (input) => invoke('jobflow:reminders.create', input),
    complete: (input) => invoke('jobflow:reminders.complete', input),
    listDue: (input = {}) => invoke('jobflow:reminders.listDue', input),
  },
  interviews: {
    list: (input = {}) => invoke('jobflow:interviews.list', input),
    get: (input) => invoke('jobflow:interviews.get', input),
    create: (input) => invoke('jobflow:interviews.create', input),
    update: (input) => invoke('jobflow:interviews.update', input),
    delete: (input) => invoke('jobflow:interviews.delete', input),
    deletePast: (input) => invoke('jobflow:interviews.deletePast', input),
    complete: (input) => invoke('jobflow:interviews.complete', input),
    setType: (input) => invoke('jobflow:interviews.setType', input),
    setNotification: (input) => invoke('jobflow:interviews.setNotification', input),
    saveReview: (input) => invoke('jobflow:interviews.saveReview', input),
    questions: {
      list: (input) => invoke('jobflow:interviews.questions.list', input),
      listByApplication: (input) => invoke('jobflow:interviews.questions.listByApplication', input),
      add: (input) => invoke('jobflow:interviews.questions.add', input),
      update: (input) => invoke('jobflow:interviews.questions.update', input),
      delete: (input) => invoke('jobflow:interviews.questions.delete', input),
    },
    questionBank: { search: (input) => invoke('jobflow:interviews.questionBank.search', input) },
  },
  profile: {
    get: () => invoke('jobflow:profile.get'),
    save: (input) => invoke('jobflow:profile.save', input),
    education: {
      add: (input) => invoke('jobflow:profile.education.add', input),
      update: (input) => invoke('jobflow:profile.education.update', input),
      delete: (input) => invoke('jobflow:profile.education.delete', input),
    },
    internships: {
      add: (input) => invoke('jobflow:profile.internships.add', input),
      update: (input) => invoke('jobflow:profile.internships.update', input),
      delete: (input) => invoke('jobflow:profile.internships.delete', input),
    },
    projects: {
      add: (input) => invoke('jobflow:profile.projects.add', input),
      update: (input) => invoke('jobflow:profile.projects.update', input),
      delete: (input) => invoke('jobflow:profile.projects.delete', input),
    },
    customFields: {
      save: (input) => invoke('jobflow:profile.customFields.save', input),
      delete: (input) => invoke('jobflow:profile.customFields.delete', input),
    },
  },
  resumes: {
    list: () => invoke('jobflow:resumes.list'),
    importFromDialog: (input = {}) => invoke('jobflow:resumes.importFromDialog', input),
    open: (input) => invoke('jobflow:resumes.open', input),
    readPdf: (input) => invoke('jobflow:resumes.readPdf', input),
    showInFolder: (input) => invoke('jobflow:resumes.showInFolder', input),
  },
  settings: {
    getInfo: () => invoke('jobflow:settings.getInfo'),
    openDataDirectory: () => invoke('jobflow:settings.openDataDirectory'),
  },
  backup: {
    exportFromDialog: () => invoke('jobflow:backup.exportFromDialog'),
    restoreFromDialog: () => invoke('jobflow:backup.restoreFromDialog'),
    exportCsvFromDialog: () => invoke('jobflow:backup.exportCsvFromDialog'),
    applyStagedRestoreAndRestart: () => invoke('jobflow:backup.applyStagedRestoreAndRestart'),
  },
  links: { openExternal: (input) => invoke('jobflow:links.openExternal', input) },
  browser: {
    getState: () => invoke('jobflow:browser.getState'),
    openTab: (input) => invoke('jobflow:browser.openTab', input),
    activateTab: (input) => invoke('jobflow:browser.activateTab', input),
    closeTab: (input) => invoke('jobflow:browser.closeTab', input),
    navigate: (input) => invoke('jobflow:browser.navigate', input),
    back: () => invoke('jobflow:browser.back'),
    forward: () => invoke('jobflow:browser.forward'),
    reload: () => invoke('jobflow:browser.reload'),
    setBounds: (input) => invoke('jobflow:browser.setBounds', input),
    capturePage: () => invoke('jobflow:browser.capturePage'),
    captureJob: (input) => invoke('jobflow:browser.captureJob', input),
    listSites: (input = {}) => invoke('jobflow:browser.listSites', input),
    saveSite: (input) => invoke('jobflow:browser.saveSite', input),
    deleteSite: (input) => invoke('jobflow:browser.deleteSite', input),
    listHistory: (input = {}) => invoke('jobflow:browser.listHistory', input),
    clearHistory: () => invoke('jobflow:browser.clearHistory'),
    clearSession: () => invoke('jobflow:browser.clearSession'),
    inspectForm: (input) => invoke('jobflow:browser.inspectForm', input),
    listAutofillMappings: (input) => invoke('jobflow:browser.listAutofillMappings', input),
    saveAutofillMapping: (input) => invoke('jobflow:browser.saveAutofillMapping', input),
    fillProfileFields: (input) => invoke('jobflow:browser.fillProfileFields', input),
    uploadResume: (input) => invoke('jobflow:browser.uploadResume', input),
    fillFocusedField: (input) => invoke('jobflow:browser.fillFocusedField', input),
    copyProfileValue: (input) => invoke('jobflow:browser.copyProfileValue', input),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) =>
        listener(state)
      ipcRenderer.on('jobflow:browser.state', handler)
      return () => ipcRenderer.removeListener('jobflow:browser.state', handler)
    },
  },
}

contextBridge.exposeInMainWorld('jobflow', api)

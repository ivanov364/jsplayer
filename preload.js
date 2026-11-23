const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('playerAPI', {
  selectAudio: (mode) => ipcRenderer.invoke('audio:select', mode),

  savePlaylist: (items) => ipcRenderer.invoke('playlist:save', items),

  loadPlaylist: () => ipcRenderer.invoke('playlist:load'),

  quit: () => ipcRenderer.invoke('app:quit'),

  onAudioSelected: (callback) => {
    const listener = (_event, mode, songs) => callback(mode, songs)
    ipcRenderer.on('audio:selected', listener)
    return () => ipcRenderer.removeListener('audio:selected', listener)
  },

  onSelectionFailed: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('audio:selection-failed', listener)
    return () => ipcRenderer.removeListener('audio:selection-failed', listener)
  },

  onPlaylistLoaded: (callback) => {
    const listener = (_event, items) => callback(items)
    ipcRenderer.on('playlist:loaded', listener)
    return () => ipcRenderer.removeListener('playlist:loaded', listener)
  },

  onPlaylistLoadFailed: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('playlist:load-failed', listener)
    return () => ipcRenderer.removeListener('playlist:load-failed', listener)
  },

  onPlaylistSaveRequested: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('playlist:save-requested', listener)
    return () => ipcRenderer.removeListener('playlist:save-requested', listener)
  },
  
  onNewPlaylistRequested: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('playlist:new-requested', listener)
    return () => ipcRenderer.removeListener('playlist:new-requested', listener)
  }
})

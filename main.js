const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')

let mainWindow

const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { parseFile } = require('music-metadata')

const audioExtensions = new Set(['.mp3', '.flac'])

const createSongObject = async (filePath) => {
  const fileName = path.basename(filePath, path.extname(filePath))
  const parts = fileName.split(/\s+[–—-]\s+/)
  const hasStructuredName = parts.length >= 4 && /^\d+$/.test(parts[2])
  const titlePart = hasStructuredName ? parts.slice(3).join(' - ') : fileName
  
  const fallback = {
    title: titlePart,
    artist: hasStructuredName ? parts[0] : 'Unknown artist',
    album: hasStructuredName ? parts[1] : path.basename(path.dirname(filePath)),
    trackNumber: hasStructuredName ? Number(parts[2]) : Number.MAX_SAFE_INTEGER,
    year: null,
    duration: null
  }
  
  let tags = {}
  let duration = null

  try {
    const { common, format } = await parseFile(filePath, { duration: true })
    tags = common
    duration = format.duration
  } catch { 
    // fallback
  }

  return {
    filePath,
    url: pathToFileURL(filePath).href,
    title: tags.title || fallback.title,
    artist: tags.artist || tags.artists?.join(', ') || fallback.artist,
    album: tags.album || fallback.album,
    trackNumber: tags.track?.no || fallback.trackNumber,
    year: tags.year || fallback.year,
    duration: duration || fallback.duration
  }
}

const getAudioFiles = async (directoryPath) => {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })

  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directoryPath, entry.name)

    if (entry.isDirectory()) return getAudioFiles(entryPath)

    if (entry.isFile() && audioExtensions.has(path.extname(entry.name).toLowerCase())) {
      return [entryPath]
    }

    return []
  }))

  return nestedFiles.flat()
}

const selectAudioFiles = async (win, mode) => {
  const isFolderMode = mode === 'folder'

  let title = 'Add audio'
  if (mode === 'open') {
    title = 'Open audio files'
  }

  const dialogOptions = { title }

  if (isFolderMode) {
    dialogOptions.properties = ['openDirectory']
  } else {
    dialogOptions.properties = ['openFile', 'multiSelections']
    dialogOptions.filters = [{
      name: 'Audio Files',
      extensions: [...audioExtensions].map((extension) => extension.slice(1))
    }]
  }

  const result = await dialog.showOpenDialog(win, dialogOptions)

  if (result.canceled) return []

  const selectedPath = result.filePaths[0]

  let filePaths = result.filePaths
  if (isFolderMode) {
    filePaths = await getAudioFiles(selectedPath)
  }

  return Promise.all(filePaths.map(async (filePath) => {
    const song = await createSongObject(filePath)

    if (isFolderMode) {
      return { ...song, sourceFolderPath: selectedPath }
    }

    return song
  }))
}

const readStoredPlaylist = async (filePath) => {
  let data
  try {
    data = JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    throw new Error('Could not read a valid playlist JSON file.')
  }

  if (!data || !Array.isArray(data.items)) {
    throw new Error('Playlist JSON must contain an items array.')
  }

  const createStoredSong = async (songPath, sourceFolderPath) => {
    if (typeof songPath !== 'string' || !audioExtensions.has(path.extname(songPath).toLowerCase())) {
      throw new Error('Playlist contains an unsupported audio format.')
    }

    try {
      await fs.access(songPath)
    } catch {
      throw new Error(`Audio file is no longer available: ${songPath}`)
    }
    return {
      ...(await createSongObject(songPath)),
      ...(sourceFolderPath ? { sourceFolderPath } : {})
    }
  }

  return Promise.all(data.items.map(async (item) => {
    if (!item || !['album', 'song'].includes(item.type) || typeof item.path !== 'string' || item.path.length === 0) {
      throw new Error('Playlist contains an invalid item.')
    }

    if (Array.isArray(item.songs)) {
      if (item.songs.length === 0) throw new Error('Playlist item contains no songs.')
      const songs = await Promise.all(item.songs.map((songPath) => (
        createStoredSong(songPath, item.type === 'album' ? item.path : undefined)
      )))
      return { type: item.type, path: item.path, songs }
    }

    if (item.type === 'song') {
      return { type: 'song', path: item.path, songs: [await createStoredSong(item.path)] }
    }

    const songs = await Promise.all((await getAudioFiles(item.path)).map((songPath) => (
      createStoredSong(songPath, item.path)
    )))

    if (songs.length === 0) {
      throw new Error(`Album folder contains no MP3 or FLAC files: ${item.path}`)
    }
    return { type: 'album', path: item.path, songs }
  }))
}

const createStorablePlaylist = (items) => {
  if (!Array.isArray(items)){
    throw new Error('Playlist items are invalid.')
  }

  return {
    items: items.map((item) => {
      if (!item || !['album', 'song'].includes(item.type) || typeof item.path !== 'string' || item.path.length === 0) {
        throw new Error('Playlist contains an invalid item.')
      }
      if (!Array.isArray(item.songs) || item.songs.length === 0 || item.songs.some((songPath) => typeof songPath !== 'string' || !audioExtensions.has(path.extname(songPath).toLowerCase()))) {
        throw new Error('Playlist item contains invalid songs.')
      }
      return { type: item.type, path: item.path, songs: item.songs }
    })
  }
}

const loadPlaylistFromDialog = async (win) => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Load playlist',
    properties: ['openFile'],
    filters: [{ name: 'Playlist Files', extensions: ['json'] }]
  })
  if (result.canceled) return null
  return readStoredPlaylist(result.filePaths[0])
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 520,
    minHeight: 520,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const requestSelection = async (mode) => {
    try {
      const selectedSongs = await selectAudioFiles(win, mode)
      if (!win.isDestroyed()) {
        win.webContents.send('audio:selected', mode, selectedSongs)
      }
    } catch (error) {
      if (!win.isDestroyed()) {
        win.webContents.send('audio:selection-failed', error.message)
      }
    }
  }

  const requestPlaylistLoad = async () => {
    try {
      const items = await loadPlaylistFromDialog(win)
      if (items === null) return
      if (!win.isDestroyed()) win.webContents.send('playlist:loaded', items)
    } catch (error) {
      if (!win.isDestroyed()) win.webContents.send('playlist:load-failed', error.message)
    }
  }

  const menu = Menu.buildFromTemplate([{
        label: 'File',
        submenu: [
            { label: 'Open audio...', click: () => requestSelection('open') },
            { type: 'separator' },
            { label: 'Add audio...', click: () => requestSelection('add') },
            { label: 'Add folder...', click: () => requestSelection('folder') },
            { type: 'separator' },
            { label: 'New playlist...', click: () => win.webContents.send('playlist:new-requested') },
            { label: 'Load playlist...', click: () => requestPlaylistLoad() },
            { label: 'Save playlist...', click: () => win.webContents.send('playlist:save-requested') },
            { type: 'separator' },
            { role: 'quit' , label: 'Exit'}
        ]
    }])

  win.setMenu(menu)
  win.loadFile(path.join(__dirname, 'index.html'))
  return win
}

ipcMain.handle('audio:select', async (event, mode) => {
  if (!['open', 'add', 'folder'].includes(mode)) {
    throw new Error(`Unsupported audio selection mode: ${mode}`)
  }

  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('Could not find the window requesting audio selection')

  return selectAudioFiles(win, mode)
})

ipcMain.handle('playlist:save', async (event, items) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('Could not find the window saving the playlist')

  const result = await dialog.showSaveDialog(win, {
    title: 'Save playlist',
    defaultPath: 'playlist.json',
    filters: [{ name: 'Playlist Files', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }

  await fs.writeFile(result.filePath, `${JSON.stringify(createStorablePlaylist(items), null, 2)}\n`)
  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle('playlist:load', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('Could not find the window loading the playlist')
  return loadPlaylistFromDialog(win)
})

ipcMain.handle('app:quit', () => {
  app.quit()
  return true
})

app.whenReady().then(() => {
  mainWindow = createWindow()

  //mainWindow.webContents.openDevTools(); //debug

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
